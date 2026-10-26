import "server-only";

import { APIUserAbortError } from "@anthropic-ai/sdk";
import type { TextBlockParam } from "@anthropic-ai/sdk/resources/messages";

import { ACTIVE_BRAND } from "@/lib/brand";
import {
  chatTraceEnabled,
  chatUpstreamRetryEnabled,
  fullManualContextEnabled,
  promptCacheEnabled,
} from "@/lib/config/chat-quality-flags";
import { CLAUDE_EFFORT, CLAUDE_MODEL } from "@/lib/config/models";
import { MissingConfigurationError } from "@/lib/config/server-env";

import {
  answerLengthGuard,
  answerLengthRetry,
  GUARDED_ATTEMPT_TIMEOUT_MS,
  timedOutAsCut,
  timedOutReply,
} from "./answer-length-guard";
import { Anthropic, getAnthropicClient } from "./anthropic";
import { chatTraceDraft } from "./chat-trace-store";
import { AiError } from "./errors";
import { selectLongContext } from "./long-context";
import { noteModelCall } from "./model-failure";
import { splitSystemPrompt } from "./prompts";
import { withTruncationRetry } from "./truncation";
import { newUpstreamRetryRecord, withUpstreamRetry } from "./upstream-retry";

/**
 * ============================================================================
 * THE ONE PLACE THIS APPLICATION TALKS TO CLAUDE
 * ============================================================================
 *
 * Extracted from `server-ask.ts` unchanged so a second caller — the Sales
 * Totals report analyser — can reuse it instead of standing up a parallel
 * Anthropic configuration. That duplication is the thing being prevented here:
 * two call sites would mean two model ids, two effort settings, and two chances
 * to get the error handling wrong.
 *
 * `import "server-only"` is what keeps ANTHROPIC_API_KEY out of the browser: a
 * client component importing this file fails the build rather than shipping a
 * key. The key is never read here at all — `getAnthropicClient()` owns it.
 *
 * THE ERROR CONTRACT MATTERS AS MUCH AS THE HAPPY PATH. The SDK's error can
 * echo the request back, and the request carries whatever the caller put in the
 * grounding block — retrieved policy text, or report figures. So no SDK error
 * is ever rethrown or interpolated into a message. What escapes this function
 * is an `AiError` with wording written here, and nothing else.
 */

/** A prior conversation turn. Structural, so callers need not build ChatMessages. */
export interface ClaudeTurn {
  readonly role: string;
  readonly content: string;
}

export interface CallClaudeInput {
  readonly system: string;
  /**
   * Context prepended to the current turn. Rebuilt per question by the caller,
   * so it is appended to this turn rather than carried in history.
   */
  readonly grounding: string;
  /**
   * A SECOND context block, for report figures, or null when this turn has
   * none.
   *
   * Separate from `grounding` rather than concatenated into it by the caller,
   * because the two blocks are cited differently and the system prompt states
   * different rules for each: a knowledge chunk is cited by a server-assigned
   * marker, a report figure by its reporting period. Concatenating them here
   * would leave one caller deciding the order of blocks whose rules another
   * file wrote.
   */
  readonly reportData?: string | null;
  /**
   * A THIRD context block, for CURRENT EMPLOYEE-LEVEL figures, or null.
   *
   * Separate again, and for the same reason the report block is separate: these
   * are measurements about NAMED PEOPLE. They take no source marker, they are
   * not policy, and they are not the location-level briefing either — a location's
   * conversion rate is not an employee's. Four sources, four citation rules,
   * and merging any two is how a coaching guideline starts being quoted back as
   * somebody's measured result.
   */
  /**
   * A FOURTH context block: the FORMS LIBRARY, or null.
   *
   * Separate for the same reason as the others, and the reason is sharpest
   * here. These are not documents to cite and not figures to read — they are
   * the templates that exist, which is a question of RECORD rather than of
   * evidence. A form named outside this block does not exist, and the system
   * prompt says so; folding the list into the knowledge block would make a
   * template name look like something retrieved and therefore citable.
   */
  readonly formsLibrary?: string | null;
  /**
   * A FIFTH block: VERIFIED RECORDS — the registered store and the Woven
   * employee facts the question touches. A record, not evidence: it takes no
   * source marker, and it is the only place a job title, store assignment or
   * employment status may come from.
   */
  readonly verifiedRecords?: string | null;
  /**
   * A SIXTH block: what this manager told the assistant before about the
   * people this conversation names, or null.
   *
   * Separate because it is a different kind of statement again — the
   * manager's own earlier account, not a document, a figure or a record — and
   * the system prompt says how it may be used. See `chat/person-memory.ts`.
   */
  readonly personMemory?: string | null;
  /**
   * A SEVENTH block: FORMS ON FILE, read from the Forms Register under the
   * caller's own forms visibility, or null. Records that exist about named
   * people — not templates, not evidence, and not the manager's own earlier
   * account — so it travels apart from the forms library it would otherwise be
   * confused with. See `forms/chat-form-records.ts`.
   */
  readonly formRecords?: string | null;
  readonly history: readonly ClaudeTurn[];
  /**
   * "budget" keeps the newest messages that fit in a token budget, up to 40.
   * Omitted, the last 10 non-empty messages are sent.
   */
  readonly historyPolicy?: "budget";
  /** Summary of turns outside that budget. Used only when historyPolicy is "budget". */
  readonly priorSummary?: string | null;
  readonly question: string;
  readonly maxTokens: number;
  /**
   * A stable block placed after the instructions and before the per-turn
   * tail, with its own cache breakpoint. The full policy manual uses this
   * so a later policy question can read it back instead of sending it again.
   */
  readonly cachedContext?: string | null;
  /**
   * Set by the chat answer only. With ANSWER_LENGTH_GUARD_ENABLED on, a reply
   * cut at max_tokens is asked for once more or ends on a whole sentence, in
   * place of `withTruncationRetry` (see `answer-length-guard.ts`). Other
   * callers, and the flag off, are unchanged.
   */
  readonly answerLengthGuard?: boolean;
  /**
   * The chat answer only. With CHAT_UPSTREAM_RETRY_ENABLED on, a retryable
   * upstream failure is tried again inside the chat turn's budget, each
   * attempt with its own deadline. Omitted — the forms ingest refinement —
   * the call is exactly what it was.
   */
  readonly upstreamRetry?: boolean;
}

/**
 * The answering path's system value. A prompt with a dynamic tail sends the
 * instruction block first, with an ephemeral cache breakpoint, and the tail
 * after it with no breakpoint. Any other system string is sent as-is.
 */
/**
 * Cache off: the listener sentence returns to the opening line. Anything
 * after that sentence in the tail — forms on file, memory, a pinned source,
 * a retrieval — stays after the instruction, which is also where the cached
 * call sends it. Splicing the whole tail into the opening would put a
 * different employee's records in front of the rules.
 */
export function uncachedSystemPrompt(staticBlock: string, dynamicTail: string): string {
  const splitAt = dynamicTail.indexOf("\n");
  const listener = splitAt < 0 ? dynamicTail : dynamicTail.slice(0, splitAt);
  const remainder = splitAt < 0 ? "" : dynamicTail.slice(splitAt);
  const breakAt = staticBlock.indexOf("\n");
  if (breakAt < 0) return `${staticBlock} ${listener}${remainder}`;
  return `${staticBlock.slice(0, breakAt)} ${listener}${staticBlock.slice(breakAt)}${remainder}`;
}

export function claudeSystemPayload(system: string, cachedContext?: string | null): string | TextBlockParam[] {
  const manual = cachedContext?.trim() ?? "";
  const parts = splitSystemPrompt(system);
  if (!manual) {
    if (!parts) return system;
    if (!promptCacheEnabled()) {
      return uncachedSystemPrompt(parts.staticBlock, parts.dynamicTail);
    }
    const blocks: TextBlockParam[] = [
      { type: "text", text: parts.staticBlock, cache_control: { type: "ephemeral" } },
    ];
    if (parts.dynamicTail.length > 0) blocks.push({ type: "text", text: parts.dynamicTail });
    return blocks;
  }

  const cachedManual: TextBlockParam = { type: "text", text: manual, cache_control: { type: "ephemeral" } };
  if (!parts) {
    return [
      { type: "text", text: system },
      cachedManual,
    ];
  }
  if (!promptCacheEnabled()) {
    return [
      { type: "text", text: uncachedSystemPrompt(parts.staticBlock, parts.dynamicTail) },
      cachedManual,
    ];
  }
  const blocks: TextBlockParam[] = [
    { type: "text", text: parts.staticBlock, cache_control: { type: "ephemeral" } },
    cachedManual,
  ];
  if (parts.dynamicTail.length > 0) blocks.push({ type: "text", text: parts.dynamicTail });
  return blocks;
}

export async function callClaude(input: CallClaudeInput): Promise<string> {
  const client = getAnthropicClient();

  // Prior turns, trimmed. The grounding block is rebuilt per question, so it is
  // appended to the current turn rather than carried in history. The last 10
  // is the cost and latency cap. A budget window is used only when the caller
  // asks for it.
  const nonempty = input.history.filter((message) => message.content.trim().length > 0);
  const bounded = input.historyPolicy === "budget" ? selectLongContext(nonempty).kept : nonempty.slice(-10);
  const history = bounded.map((message) => ({
    role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: message.content,
  }));
  if (input.historyPolicy === "budget" && input.priorSummary?.trim()) {
    const note = `Earlier in this conversation:\n${input.priorSummary.trim()}`;
    if (history.length === 0 || history[0]!.role === "assistant") {
      history.unshift({ role: "user", content: note });
    } else {
      history[0] = { role: "user", content: `${note}\n\n${history[0]!.content}` };
    }
  }

  // The API requires the first message to be a user turn.
  while (history.length > 0 && history[0]!.role === "assistant") history.shift();

  // ANSWER_LENGTH_GUARD_ENABLED, chat answer only: null otherwise, and then nothing below differs from main.
  const guard = answerLengthGuard(input);
  const started = Date.now();
  // CHAT_UPSTREAM_RETRY_ENABLED, chat answer only: null when off or not asked for,
  // and then nothing below differs from main.
  const retry = input.upstreamRetry && chatUpstreamRetryEnabled() ? newUpstreamRetryRecord() : null;
  // The retry budget runs from the turn's start when a trace is open, otherwise this call's.
  // With the guard on too, both share the guard's turn start (the same reading).
  const budgetFrom = retry ? (guard?.turnStartedAt ?? chatTraceDraft()?.startedAt ?? started) : started;
  /*
   * One request to the model. `options` is passed only by the upstream
   * retry, which turns the SDK's own retries off so it alone decides how
   * many attempts there are, and gives the attempt its deadline; off, the
   * request is exactly what main sends.
   */
  const attempt = async (
    maxTokens: number,
    options?: { maxRetries: number; timeout: number; signal: AbortSignal },
    onText?: (snapshot: string) => void,
  ) => {
    const attemptStarted = Date.now();
    const params = {
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      thinking: { type: "adaptive" as const },
      output_config: { effort: CLAUDE_EFFORT },
      system: claudeSystemPayload(input.system, input.cachedContext),
      messages: [
        ...history,
        {
          role: "user" as const,
          // Every context block and then the question, in that order: the
          // question last is what keeps a long briefing from burying it.
          content: [
            input.grounding,
            ...(input.reportData ? [input.reportData] : []),
            ...(input.personMemory ? [input.personMemory] : []),
            ...(input.formsLibrary ? [input.formsLibrary] : []),
            ...(input.verifiedRecords ? [input.verifiedRecords] : []),
            ...(input.formRecords ? [input.formRecords] : []),
            `QUESTION\n\n${input.question}`,
          ].join("\n\n"),
        },
      ],
    };
    // The live client always has messages.stream. Streaming with the
    // flags off would change production on merge, so stream only when a
    // flag that reads the stream is on. A double with no stream stays
    // on create either way, and firstTokenMs stays null on create.
    const useStream =
      (chatTraceEnabled() || promptCacheEnabled() || fullManualContextEnabled()) &&
      typeof client.messages.stream === "function";
    if (!useStream) {
      const created = options ? await client.messages.create(params, options) : await client.messages.create(params);
      return Object.assign(created, { firstTokenMs: null as number | null });
    }
    let firstTokenMs: number | null = null;
    const running = options ? client.messages.stream(params, options) : client.messages.stream(params);
    running.on("text", (_delta: unknown, snapshot: unknown) => {
      if (firstTokenMs === null) firstTokenMs = Date.now() - attemptStarted;
      if (onText && typeof snapshot === "string") onText(snapshot);
    });
    const streamed = await running.finalMessage();
    return Object.assign(streamed, { firstTokenMs });
  };
  try {
    const response = await (guard ? answerLengthRetry(guard) : withTruncationRetry)(
      guard?.maxTokens ?? input.maxTokens,
      async (maxTokens: number, outer?: AbortSignal) => {
        if (retry && guard) {
          /*
           * Guard and retry both on: the guard sits outside and the retry
           * inside each call. The first call and the length retry (which
           * passes `outer`, the guard's abort at the turn's 60 s) each go
           * through `withUpstreamRetry` on one turn budget, each attempt
           * capped at 60 s instead of 45 s.
           */
          let streamedSoFar = "";
          const keep = outer
            ? undefined
            : (snapshot: string) => {
                if (snapshot.length > streamedSoFar.length) streamedSoFar = snapshot;
              };
          try {
            return await withUpstreamRetry(
              retry,
              budgetFrom,
              (limits) => {
                if (outer?.aborted) throw new APIUserAbortError();
                const signal = outer ? AbortSignal.any([outer, limits.signal]) : limits.signal;
                return attempt(maxTokens, { maxRetries: 0, timeout: limits.timeout, signal }, keep);
              },
              GUARDED_ATTEMPT_TIMEOUT_MS,
            );
          } catch (error) {
            // Every attempt at the first call ran out of time after streaming a
            // whole sentence: that text, shown cut clean, instead of the error.
            const salvaged = outer ? null : timedOutAsCut(error, streamedSoFar);
            if (salvaged === null) throw error;
            return timedOutReply(salvaged) as unknown as Awaited<ReturnType<typeof attempt>>;
          }
        }
        if (retry) {
          return withUpstreamRetry(retry, budgetFrom, (limits) =>
            attempt(maxTokens, { maxRetries: 0, timeout: limits.timeout, signal: limits.signal }),
          );
        }
        return attempt(maxTokens);
      },
      `${ACTIVE_BRAND.assistantName} ran out of room before finishing that answer, so it was not shown. Try asking for less at once, or split the question into parts.`,
    );

    const noted = {
      model: CLAUDE_MODEL,
      maxTokens: guard?.maxTokens ?? input.maxTokens,
      stopReason: response.stop_reason ?? null,
      latencyMs: Date.now() - started,
      firstTokenMs: response.firstTokenMs,
      usage: response.usage,
      ...(retry?.retried ? { retried: true } : {}),
    };
    if (response.stop_reason === "refusal") {
      noteModelCall({ ...noted, subtype: "refused" });
      throw new AiError(
        "refused",
        `${ACTIVE_BRAND.assistantName} could not answer that question. Try rephrasing it, or ask a manager directly.`,
        422,
      );
    }

    const text = response.content
      .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) {
      noteModelCall({ ...noted, subtype: "empty_answer" });
      throw new AiError("model_failed", `${ACTIVE_BRAND.assistantName} returned an empty answer.`, 502);
    }

    noteModelCall(noted);
    return text;
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (error instanceof MissingConfigurationError) {
      throw new AiError("not_configured", error.message, 503, error.missing);
    }
    // The SDK error can echo the request, which carries confidential grounding
    // text. Only the class name is kept — never the body. The class, status,
    // and subtype are recorded for the trace before this object is discarded.
    noteModelCall({
      model: CLAUDE_MODEL,
      maxTokens: guard?.maxTokens ?? input.maxTokens,
      stopReason: null,
      latencyMs: Date.now() - started,
      usage: null,
      error,
      // With the retry on: whether it was tried again, and the subtype read
      // from the SDK's own type field (a streamed overloaded error has no status).
      ...(retry ? { retried: retry.retried, subtype: retry.last?.subtype ?? null } : {}),
    });
    logAnthropicFailure(error);
    if (error instanceof Anthropic.APIError && rejectsConfiguration(error.status)) {
      throw new AiError(
        "not_configured",
        `${ACTIVE_BRAND.assistantName} could not reach the language model: Anthropic rejected this deployment's API key or model (HTTP ${error.status}). An administrator needs to check the Anthropic settings. No answer was generated.`,
        503,
      );
    }
    throw new AiError(
      "model_failed",
      `${ACTIVE_BRAND.assistantName} could not reach the language model. No answer was generated.`,
      502,
    );
  }
}

/**
 * A REJECTION THAT ASKING AGAIN CANNOT FIX: the key is invalid (401), the key
 * may not use this model (403), or the model id does not exist (404). Reported
 * as configuration, so the manager is not told to "try again in a moment" about
 * a deployment setting.
 */
function rejectsConfiguration(status: number | undefined): boolean {
  return status === 401 || status === 403 || status === 404;
}

/**
 * ONE LINE AN OPERATOR CAN ACT ON, AND NOTHING FROM THE REQUEST.
 *
 * Every failure used to be discarded here, so a deployment whose key or model
 * Anthropic refused answered "could not produce an answer" with no trace in any
 * log. Logged: the HTTP status, Anthropic's error type and request id, and the
 * configured model and effort (JSON-quoted, so stray whitespace in an override
 * shows). Never the SDK message or body, which can echo grounding text.
 */
/**
 * One forced tool call. Used by the flagged form reader and the flagged
 * query rewrite. The answering path stays on `callClaude`. A failure here
 * uses the same wording and never echoes the request.
 */
export async function callClaudeTool(input: {
  readonly model: string;
  readonly system: string;
  readonly messages: readonly { role: "user" | "assistant"; content: string }[];
  readonly tool: {
    readonly name: string;
    readonly description: string;
    readonly input_schema: {
      readonly type: "object";
      readonly properties?: unknown;
      readonly required?: readonly string[];
      readonly additionalProperties?: boolean;
    };
  };
  readonly maxTokens: number;
}): Promise<unknown> {
  const detailed = await callClaudeToolDetailed(input);
  return detailed.input;
}

/** The tool payload plus the usage the form extraction records on chat_traces. */
export async function callClaudeToolDetailed(input: {
  readonly model: string;
  readonly system: string;
  readonly messages: readonly { role: "user" | "assistant"; content: string }[];
  readonly tool: {
    readonly name: string;
    readonly description: string;
    readonly input_schema: {
      readonly type: "object";
      readonly properties?: unknown;
      readonly required?: readonly string[];
      readonly additionalProperties?: boolean;
    };
  };
  readonly maxTokens: number;
}): Promise<{ input: unknown; inputTokens: number | null; outputTokens: number | null }> {
  const client = getAnthropicClient();
  const messages = input.messages.filter((message) => message.content.trim() !== "");
  try {
    const response = await client.messages.create({
      model: input.model,
      max_tokens: input.maxTokens,
      system: input.system,
      tools: [
        {
          name: input.tool.name,
          description: input.tool.description,
          input_schema: {
            type: "object",
            properties: (input.tool.input_schema.properties ?? {}) as Record<string, unknown>,
            required: input.tool.input_schema.required ? [...input.tool.input_schema.required] : undefined,
            additionalProperties: input.tool.input_schema.additionalProperties,
          },
        },
      ],
      tool_choice: { type: "tool", name: input.tool.name },
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
    });
    const block = response.content.find((item) => item.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      throw new AiError(
        "model_failed",
        `${ACTIVE_BRAND.assistantName} could not reach the language model. No answer was generated.`,
        502,
      );
    }
    const usage = response.usage as { input_tokens?: unknown; output_tokens?: unknown } | undefined;
    return {
      input: block.input,
      inputTokens: typeof usage?.input_tokens === "number" ? usage.input_tokens : null,
      outputTokens: typeof usage?.output_tokens === "number" ? usage.output_tokens : null,
    };
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (error instanceof MissingConfigurationError) throw error;
    throw new AiError(
      "model_failed",
      `${ACTIVE_BRAND.assistantName} could not reach the language model. No answer was generated.`,
      502,
    );
  }
}

function logAnthropicFailure(error: unknown): void {
  const detail =
    error instanceof Anthropic.APIError
      ? `status=${error.status ?? "none"} type=${error.type ?? "unknown"} request_id=${error.requestID ?? "none"}`
      : `class=${error instanceof Error ? error.name : typeof error}`;
  console.error(
    `[callClaude] Anthropic request failed: ${detail} model=${JSON.stringify(CLAUDE_MODEL)} effort=${JSON.stringify(CLAUDE_EFFORT)}`,
  );
}
