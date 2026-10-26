import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { chatErrorTitle, toChatTurnError } from "@/features/chat/chat-error";
import { ACTIVE_BRAND } from "@/lib/brand";

import { runChatTrace, type ChatTraceDraft } from "./chat-trace-store";

/**
 * ============================================================================
 * "can you make a weekly coaching for how to get efts" — CUT AT max_tokens
 * ============================================================================
 *
 * Ported from the sibling app's production turn (26 Oct 2026), QA's exact
 * wording. chat_traces there: stop_reason=max_tokens, max_tokens 2048,
 * output_tokens 2048 of which thinking 768; the reply ended mid-sentence on
 * "…so the rest of the team can copy it [S5". Here, on main, the same cut goes
 * to `withTruncationRetry`: once more at 4096, and cut again, an error.
 *
 * With ANSWER_LENGTH_GUARD_ENABLED on, the guard replaces withTruncationRetry
 * for the answer call: 3584 tokens, at most one more call at the same budget,
 * and a clean cut instead of the error. Never both retries.
 *
 * The turn goes through `answerQuestion` and the real `callClaude`; the
 * Anthropic client is the only double, and it answers from a script.
 */

type ScriptedReply =
  | { readonly text: string; readonly stop: "end_turn" | "max_tokens" }
  /** An HTTP error from the upstream, e.g. a 529 overloaded_error. */
  | { readonly fail: number; readonly type: string }
  /** No reply until the request is aborted. */
  | { readonly hang: true }
  /** Streams this text, then stalls until the request is aborted (the stream path only). */
  | { readonly hangAfter: string };

const state = vi.hoisted(() => ({
  answerRequests: [] as { max_tokens: number; options: unknown }[],
  script: [] as ScriptedReply[],
  waits: [] as number[],
}));

/** The scripted outcome of one answer call, for both the create and the stream path. */
async function scripted(
  params: { max_tokens: number; thinking?: unknown },
  options: unknown,
  onText: (snapshot: string) => void,
) {
  if (params.thinking) state.answerRequests.push({ max_tokens: params.max_tokens, options });
  const next = params.thinking ? state.script.shift() : undefined;
  const reply = next ?? { text: "Here is the plan.", stop: "end_turn" as const };
  const signal = (options as { signal?: AbortSignal } | undefined)?.signal;
  const sdk = await import("@anthropic-ai/sdk");
  const aborted = () =>
    new Promise<never>((_, reject) => {
      if (signal?.aborted) reject(new sdk.APIUserAbortError());
      signal?.addEventListener("abort", () => reject(new sdk.APIUserAbortError()));
    });
  if ("fail" in reply) {
    const body = { type: "error", error: { type: reply.type, message: "upstream" } };
    throw sdk.APIError.generate(reply.fail, body, undefined, new Headers());
  }
  if ("hang" in reply) return aborted();
  if ("hangAfter" in reply) {
    onText(reply.hangAfter);
    return aborted();
  }
  return {
    content: [{ type: "text", text: reply.text }],
    stop_reason: reply.stop,
    usage: { input_tokens: 1, output_tokens: 2048, output_tokens_details: { thinking_tokens: 768 } },
  };
}

vi.mock("./anthropic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./anthropic")>()),
  getAnthropicClient: () => ({
    messages: {
      create: (params: { max_tokens: number; thinking?: unknown }, options?: unknown) =>
        scripted(params, options, () => {}),
      // Used only when a streaming flag is on (PROMPT_CACHE_ENABLED below).
      stream: (params: { max_tokens: number; thinking?: unknown }, options?: unknown) => {
        const handlers: ((delta: string, snapshot: string) => void)[] = [];
        return {
          on(event: string, handler: (delta: string, snapshot: string) => void) {
            if (event === "text") handlers.push(handler);
          },
          finalMessage: () =>
            scripted(params, options, (snapshot) => {
              for (const handler of handlers) handler(snapshot, snapshot);
            }),
        };
      },
    },
  }),
}));

/** CHAT_UPSTREAM_RETRY_ENABLED's wait between attempts, recorded instead of slept. */
vi.mock("./retry-wait", () => ({
  waitBeforeRetry: async (ms: number) => {
    state.waits.push(ms);
  },
}));

vi.mock("./query-rewrite-claude", () => ({
  rewriteRetrievalQuery: async (input: { question: string }) => input.question,
}));
vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
}));
vi.mock("./form-proposal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./form-proposal")>()),
  proposeFormForTurn: async () => null,
  suggestFormsForTurn: () => null,
}));
vi.mock("@/lib/forms/repository", () => ({ listTemplateSummaries: async () => [] }));
vi.mock("@/lib/ai/entity-facts", () => ({ resolveChatEntities: async () => ({ block: null, direct: null }) }));
vi.mock("@/lib/chat/person-memory-store", () => ({ recallPeople: async () => null }));
vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    readonly name = "test double";
    async match() {
      return [1, 2, 3, 4, 5].map((n) => ({
        chunk_id: `chunk-coaching-${n}`,
        document_id: "doc-coaching",
        document_title: "Store Coaching Guide",
        category: "training",
        locator: `Page ${n}`,
        page: n,
        section: "Weekly coaching",
        content: `Coaching point ${n}: ask every customer, explain the benefit, and track sign-ups.`,
        similarity: 0.9 - n / 100,
      }));
    }
    async fetchRoleGrounding() {
      return null;
    }
    async fetchNamedHandbook() {
      return { ok: false, reason: "none" };
    }
    async fetchOfficialPolicyManual() {
      return { ok: false, reason: "none" };
    }
  },
}));

const ACTOR = {
  role: "location_manager" as never,
  scope: { level: "location", primaryAreaId: "loc-0101", alsoCoversAreaIds: [] } as never,
};

const QA_LOWER = "can you make a weekly coaching for how to get efts";
const QA_SENTENCE = "Can you make a weekly coaching for how to get efts";

/** The reply as production cut it: a heading, bullets, then a paragraph stopped on "[S5". */
const CUT_REPLY = [
  "Here's a weekly coaching plan to grow sign-ups at your store [S1].",
  "",
  "## Week 1: Know the offer",
  "- Walk each team member through the sign-up benefits [S2].",
  "- Role-play the greeting and the first ask until it sounds natural.",
  "",
  "## Week 2: Ask every customer",
  "Make the offer part of every checkout [S3]. Track who asked and who signed up [S4]. At the Friday huddle, share the wording that worked best so the rest of the team can copy it [S5",
].join("\n");

/**
 * What the manager sees after a clean cut: everything up to the paragraph's
 * last whole sentence. The [S#] markers become source cards, as on main.
 */
const CLEAN_CUT_SHOWN = [
  "Here's a weekly coaching plan to grow sign-ups at your store.",
  "",
  "## Week 1: Know the offer",
  "- Walk each team member through the sign-up benefits.",
  "- Role-play the greeting and the first ask until it sounds natural.",
  "",
  "## Week 2: Ask every customer",
  "Make the offer part of every checkout. Track who asked and who signed up.",
].join("\n");

const FULL_REPLY = [
  CUT_REPLY.replace(/\[S5$/, "[S5]."),
  "",
  "## Week 3: Coach in the moment",
  "- Listen to one check-in per shift and give one piece of feedback.",
  "",
  "Keep the plan short and repeat it every week.",
].join("\n");

const END_TURN_REPLY =
  "Here's a weekly coaching plan for sign-ups [S1].\n\n- Monday: review the offer [S2].\n- Friday: share what worked.";

async function ask(question: string): Promise<string> {
  const { answerQuestion } = await import("./server-ask");
  const response = await answerQuestion(
    {
      question,
      mode: "standard",
      history: [],
      scopeId: "bcs-core",
      context: { userName: "Test Manager", locationName: "All areas", todayIso: "2026-10-26" },
    } as never,
    ACTOR as never,
  );
  return response.content;
}

function draft(startedAt: number): ChatTraceDraft {
  return {
    startedAt,
    conversationId: null,
    messageId: null,
    userId: null,
    originalQuery: QA_LOWER,
    rewrittenQuery: null,
    intent: null,
    retrievalCount: null,
    retrieved: [],
    prompt: null,
    formInProgress: false,
    modelCall: null,
    formExtraction: null,
    errorSubtype: null,
    errorClass: null,
    errorStatus: null,
    succeeded: null,
  };
}

function guardOn(on: boolean): void {
  if (on) vi.stubEnv("ANSWER_LENGTH_GUARD_ENABLED", "true");
  else vi.stubEnv("ANSWER_LENGTH_GUARD_ENABLED", "");
  // Pinned off here, so these runs stay the validated guard alone even when
  // the suite runs with CHAT_UPSTREAM_RETRY_ENABLED set; `retryOn` turns it on.
  vi.stubEnv("CHAT_UPSTREAM_RETRY_ENABLED", "");
}

function retryOn(): void {
  vi.stubEnv("CHAT_UPSTREAM_RETRY_ENABLED", "true");
}

beforeAll(async () => {
  await import("./server-ask");
}, 60_000);

beforeEach(() => {
  state.answerRequests = [];
  state.script = [];
  state.waits = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe.each([QA_LOWER, QA_SENTENCE])("QA's turn %j with ANSWER_LENGTH_GUARD_ENABLED on", (question) => {
  it("asks for 3584 tokens, and a cut reply followed by an end_turn retry shows the whole retry", async () => {
    guardOn(true);
    state.script = [
      { text: CUT_REPLY, stop: "max_tokens" },
      { text: FULL_REPLY, stop: "end_turn" },
    ];
    const content = await ask(question);

    expect(state.answerRequests.map((request) => request.max_tokens)).toEqual([3584, 3584]);
    expect(content).toContain("so the rest of the team can copy it");
    expect(content).toContain("Keep the plan short and repeat it every week.");
    expect(content).not.toMatch(/\[S\d*$/);
    const logged = vi.mocked(console.warn).mock.calls.map((call) => String(call[0]));
    expect(logged.some((line) => /stop_reason=max_tokens .*elapsed_ms=\d+ retried=true outcome=complete/.test(line))).toBe(
      true,
    );
  });

  it("both attempts cut: the reply ends at its last whole sentence, with no [S token", async () => {
    guardOn(true);
    state.script = [
      { text: CUT_REPLY, stop: "max_tokens" },
      { text: CUT_REPLY, stop: "max_tokens" },
    ];
    const content = await ask(question);

    expect(state.answerRequests.map((request) => request.max_tokens)).toEqual([3584, 3584]);
    expect(content).toBe(CLEAN_CUT_SHOWN);
    expect(content).not.toContain("[S");
  });

  it("a turn already 40 s old is not retried; the reply is cut clean", async () => {
    guardOn(true);
    state.script = [
      { text: CUT_REPLY, stop: "max_tokens" },
      { text: FULL_REPLY, stop: "end_turn" },
    ];
    // The turn's clock here is the chat trace's start.
    const content = await runChatTrace(draft(Date.now() - 40_000), () => ask(question));

    expect(state.answerRequests.map((request) => request.max_tokens)).toEqual([3584]);
    expect(content).toBe(CLEAN_CUT_SHOWN);
    const logged = vi.mocked(console.warn).mock.calls.map((call) => String(call[0]));
    expect(logged.some((line) => /stop_reason=max_tokens .*retried=false outcome=cut/.test(line))).toBe(true);
  });
});

describe("chat_traces records the turn as it already does", () => {
  it("a cut reply records max_tokens 3584 and stop_reason max_tokens", async () => {
    guardOn(true);
    state.script = [
      { text: CUT_REPLY, stop: "max_tokens" },
      { text: CUT_REPLY, stop: "max_tokens" },
    ];
    const trace = draft(Date.now());
    await runChatTrace(trace, () => ask(QA_LOWER));
    expect(trace.modelCall?.maxTokens).toBe(3584);
    expect(trace.modelCall?.stopReason).toBe("max_tokens");
    expect(trace.modelCall?.thinkingTokens).toBe(768);
  });
});

describe("ANSWER_LENGTH_GUARD_ENABLED off is main: withTruncationRetry as it ships", () => {
  it.each([QA_LOWER, QA_SENTENCE])("%j sends 2048, then 4096 once, and shows the longer reply", async (question) => {
    guardOn(false);
    state.script = [
      { text: CUT_REPLY, stop: "max_tokens" },
      { text: FULL_REPLY, stop: "end_turn" },
    ];
    const content = await ask(question);

    expect(state.answerRequests.map((request) => request.max_tokens)).toEqual([2048, 4096]);
    expect(content).toContain("Keep the plan short and repeat it every week.");
  });

  it.each([QA_LOWER, QA_SENTENCE])("%j cut twice is main's truncated error, not a cut reply", async (question) => {
    guardOn(false);
    state.script = [
      { text: CUT_REPLY, stop: "max_tokens" },
      { text: CUT_REPLY, stop: "max_tokens" },
    ];
    await expect(ask(question)).rejects.toMatchObject({ code: "truncated" });
    expect(state.answerRequests.map((request) => request.max_tokens)).toEqual([2048, 4096]);
  });
});

describe("NEVER-BREAK: an end_turn reply is byte-identical with the flag on and off", () => {
  it.each([QA_LOWER, QA_SENTENCE])("%j", async (question) => {
    guardOn(false);
    state.script = [{ text: END_TURN_REPLY, stop: "end_turn" }];
    const off = await ask(question);

    guardOn(true);
    state.script = [{ text: END_TURN_REPLY, stop: "end_turn" }];
    const on = await ask(question);

    expect(on).toBe(off);
    // One call each way: an end_turn reply is never asked for again.
    expect(state.answerRequests.map((request) => request.max_tokens)).toEqual([2048, 3584]);
  });
});

/* ============================================================================
 * COMPOSED WITH CHAT_UPSTREAM_RETRY_ENABLED (QA coordinator's ruling, 26 Oct)
 * ============================================================================
 *
 * The guard sits outside and the retry inside each call: the first call and
 * the length retry each go through `withUpstreamRetry`, on one 120 s turn
 * budget, each attempt capped at 60 s (45 s with the guard off). The length
 * retry starts only before 35 s and is aborted and abandoned at 60 s.
 */

type Options = { maxRetries?: number; timeout?: number; signal?: AbortSignal } | undefined;

function sent(): Options[] {
  return state.answerRequests.map((request) => request.options as Options);
}

function logged(): string[] {
  return vi.mocked(console.warn).mock.calls.map((call) => String(call[0]));
}

/** Lets real work (module loading, I/O) run while the clock is fake. */
async function until(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 5_000 && !condition(); i += 1) await new Promise((resolve) => setImmediate(resolve));
  expect(condition()).toBe(true);
}

/** What the manager reads when the turn throws: the chat screen's error card. */
async function cardOrContent(question: string): Promise<{ content?: string; card?: Record<string, unknown> }> {
  try {
    return { content: await ask(question) };
  } catch (caught) {
    const error = toChatTurnError(caught, question);
    return { card: { title: chatErrorTitle(error.kind), message: error.message, retryable: error.retryable } };
  }
}

/** The error card for model_failed, as main and the retry PR already show it. */
const PLAIN_CARD = {
  title: "No answer was produced",
  message: `${ACTIVE_BRAND.assistantName} could not produce an answer. Nothing was answered from memory — try again in a moment.`,
  retryable: true,
};

/** Runs a turn on the fake clock, stepping it by `steps`, and returns what the manager saw and when. */
async function onFakeClock(
  turn: () => Promise<{ content?: string; card?: Record<string, unknown> }>,
  steps: readonly number[],
): Promise<{ seen: { content?: string; card?: Record<string, unknown> }; tookMs: number }> {
  const started = Date.now();
  let endedAt: number | null = null;
  const pending = turn().finally(() => {
    endedAt = Date.now();
  });
  for (const [index, step] of steps.entries()) {
    await until(() => state.answerRequests.length === index + 1);
    await vi.advanceTimersByTimeAsync(step);
  }
  await until(() => endedAt !== null);
  return { seen: await pending, tookMs: endedAt! - started };
}

describe.each([QA_LOWER, QA_SENTENCE])("QA's turn %j with the guard and CHAT_UPSTREAM_RETRY_ENABLED on", (question) => {
  it("the first reply stops at max_tokens, the length retry gets a 529 then a 200: the whole reply", async () => {
    guardOn(true);
    retryOn();
    state.script = [
      { text: CUT_REPLY, stop: "max_tokens" },
      { fail: 529, type: "overloaded_error" },
      { text: FULL_REPLY, stop: "end_turn" },
    ];
    const content = await ask(question);

    expect(content).toContain("so the rest of the team can copy it");
    expect(content).toContain("Keep the plan short and repeat it every week.");
    // Every call, the length retry's included, went through the retry wrapper.
    expect(state.answerRequests.map((request) => request.max_tokens)).toEqual([3584, 3584, 3584]);
    expect(state.waits).toEqual([1_000]);
    expect(sent().every((options) => options?.maxRetries === 0 && options.signal instanceof AbortSignal)).toBe(true);
    expect(sent().map((options) => options?.timeout)).toEqual([60_000, 60_000, 60_000]);
    expect(logged().some((line) => /attempt 1 failed: upstream 529; retrying in 1000 ms/.test(line))).toBe(true);
    expect(logged().some((line) => /stop_reason=max_tokens .*retried=true outcome=complete/.test(line))).toBe(true);
  });

  it("a hanging first attempt: 60 s caps, no length retry after 35 s, a clean cut; never a 504", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    guardOn(true);
    retryOn();
    state.script = [{ hang: true }, { text: CUT_REPLY, stop: "max_tokens" }, { text: FULL_REPLY, stop: "end_turn" }];
    const { seen, tookMs } = await onFakeClock(() => cardOrContent(question), [60_000]);

    expect(seen).toEqual({ content: CLEAN_CUT_SHOWN });
    expect(tookMs).toBe(60_000);
    // 60 s each, not 45 s; the cut reply came at 60 s, past the 35 s gate, so it was not asked again.
    expect(sent().map((options) => options?.timeout)).toEqual([60_000, 60_000]);
    expect(logged().some((line) => /attempt 1 failed: upstream timeout/.test(line))).toBe(true);
    expect(logged().some((line) => /elapsed_ms=60000 retried=false outcome=cut/.test(line))).toBe(true);
  });

  it("every attempt hangs: the plain card inside the 120 s budget, never a 504", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    guardOn(true);
    retryOn();
    state.script = [{ hang: true }, { hang: true }, { hang: true }];
    const { seen, tookMs } = await onFakeClock(() => cardOrContent(question), [60_000, 60_000]);

    expect(seen).toEqual({ card: PLAIN_CARD });
    expect(tookMs).toBe(120_000);
    // Two 60 s attempts fill the budget, so no third starts (45 s caps made three).
    expect(sent().map((options) => options?.timeout)).toEqual([60_000, 60_000]);
    expect(logged().some((line) => /model call failed after 2 attempts: upstream timeout/.test(line))).toBe(true);
  });

  it("a cut reply at 30 s is asked again; that retry is aborted at 60 s and starts no further attempt", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    guardOn(true);
    retryOn();
    state.script = [{ text: CUT_REPLY, stop: "max_tokens" }, { hang: true }, { text: FULL_REPLY, stop: "end_turn" }];
    let content: string | null = null;
    const pending = runChatTrace(draft(Date.now() - 30_000), () => ask(question)).then((text) => {
      content = text;
    });

    await until(() => state.answerRequests.length === 2);
    expect(sent()[1]?.timeout).toBe(60_000);
    await vi.advanceTimersByTimeAsync(30_000);
    await pending;
    expect(content).toBe(CLEAN_CUT_SHOWN);
    expect(sent()[1]?.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state.answerRequests).toHaveLength(2);
    expect(state.waits).toEqual([]);
  });

  it("the 35 s gate: a cut reply in a turn already 36 s old is not asked again", async () => {
    guardOn(true);
    retryOn();
    state.script = [
      { text: CUT_REPLY, stop: "max_tokens" },
      { text: FULL_REPLY, stop: "end_turn" },
    ];
    const content = await runChatTrace(draft(Date.now() - 36_000), () => ask(question));

    expect(state.answerRequests).toHaveLength(1);
    expect(content).toBe(CLEAN_CUT_SHOWN);
    expect(logged().some((line) => /retried=false outcome=cut/.test(line))).toBe(true);
  });
});

describe.each([QA_LOWER, QA_SENTENCE])("QA's turn %j with the guard on and CHAT_UPSTREAM_RETRY_ENABLED off is #222", (question) => {
  it("both calls are main's requests, and a 529 on the length retry shows the clean cut", async () => {
    guardOn(true);
    state.script = [
      { text: CUT_REPLY, stop: "max_tokens" },
      { fail: 529, type: "overloaded_error" },
    ];
    const content = await ask(question);

    expect(content).toBe(CLEAN_CUT_SHOWN);
    expect(state.answerRequests.map((request) => request.max_tokens)).toEqual([3584, 3584]);
    expect(sent()).toEqual([undefined, undefined]);
    expect(state.waits).toEqual([]);
    expect(logged().some((line) => /model call/.test(line))).toBe(false);
  });
});

describe.each([QA_LOWER, QA_SENTENCE])("QA's turn %j with the guard off and CHAT_UPSTREAM_RETRY_ENABLED on is #212", (question) => {
  it("45 s caps, 2048 tokens, three attempts that hang end with the plain card", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    guardOn(false);
    retryOn();
    state.script = [{ hang: true }, { hang: true }, { hang: true }];
    const { seen } = await onFakeClock(() => cardOrContent(question), [45_000, 45_000, 30_000]);

    expect(seen).toEqual({ card: PLAIN_CARD });
    expect(state.answerRequests.map((request) => request.max_tokens)).toEqual([2048, 2048, 2048]);
    expect(sent().map((options) => options?.timeout)).toEqual([45_000, 45_000, 30_000]);
    expect(sent().every((options) => Object.keys(options ?? {}).sort().join() === "maxRetries,signal,timeout")).toBe(true);
  });

  it("a 529, then main's cut at 2048, then withTruncationRetry's 4096: the longer reply", async () => {
    guardOn(false);
    retryOn();
    state.script = [
      { fail: 529, type: "overloaded_error" },
      { text: CUT_REPLY, stop: "max_tokens" },
      { text: FULL_REPLY, stop: "end_turn" },
    ];
    const content = await ask(question);

    expect(state.answerRequests.map((request) => request.max_tokens)).toEqual([2048, 2048, 4096]);
    expect(state.waits).toEqual([1_000]);
    expect(sent().map((options) => options?.timeout)).toEqual([45_000, 45_000, 45_000]);
    expect(content).toContain("Keep the plan short and repeat it every week.");
    expect(logged().some((line) => /answer-length-guard/.test(line))).toBe(false);
  });
});

/*
 * This app has no MODEL_RETRY flag: MODEL_RETRY_ENABLED set changes nothing
 * here, so what is pinned is what exists. When the longer answer runs out of
 * time the manager sees the clean cut, never less than a cut answer.
 */
describe.each([QA_LOWER, QA_SENTENCE])("QA's turn %j: a timed-out longer answer (MODEL_RETRY_ENABLED set, no such flag here)", (question) => {
  beforeEach(() => {
    vi.stubEnv("MODEL_RETRY_ENABLED", "true");
  });

  it("retry off: a length retry that fails shows the first reply cut clean, with main's request options", async () => {
    guardOn(true);
    state.script = [
      { text: CUT_REPLY, stop: "max_tokens" },
      { fail: 504, type: "api_error" },
    ];
    expect(await ask(question)).toBe(CLEAN_CUT_SHOWN);
    expect(sent()).toEqual([undefined, undefined]);
  });

  it("retry on: a 529 on every attempt of the length retry shows the clean cut, not the error", async () => {
    guardOn(true);
    retryOn();
    state.script = [
      { text: CUT_REPLY, stop: "max_tokens" },
      { fail: 529, type: "overloaded_error" },
      { fail: 529, type: "overloaded_error" },
      { fail: 529, type: "overloaded_error" },
    ];
    expect(await ask(question)).toBe(CLEAN_CUT_SHOWN);
    expect(state.answerRequests).toHaveLength(4);
    expect(sent().map((options) => options?.timeout)).toEqual([60_000, 60_000, 60_000, 60_000]);
  });

  it("retry on: every attempt at the first call stalls after streaming; the streamed text is shown cut clean, not the card", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.stubEnv("PROMPT_CACHE_ENABLED", "true");
    guardOn(true);
    retryOn();
    state.script = [{ hangAfter: CUT_REPLY }, { hangAfter: CUT_REPLY }];
    const { seen } = await onFakeClock(() => cardOrContent(question), [60_000, 60_000]);

    expect(seen).toEqual({ content: CLEAN_CUT_SHOWN });
    expect(logged().some((line) => /every attempt timed out; showing the streamed text cut clean/.test(line))).toBe(true);
  });

  it("retry on, the guard off: the same stall is the retry PR's plain card", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.stubEnv("PROMPT_CACHE_ENABLED", "true");
    guardOn(false);
    retryOn();
    state.script = [{ hangAfter: CUT_REPLY }, { hangAfter: CUT_REPLY }, { hangAfter: CUT_REPLY }];
    const { seen } = await onFakeClock(() => cardOrContent(question), [45_000, 45_000, 30_000]);

    expect(seen).toEqual({ card: PLAIN_CARD });
  });

  it("retry on: a stall before any whole sentence is still the plain card, never half a sentence", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.stubEnv("PROMPT_CACHE_ENABLED", "true");
    guardOn(true);
    retryOn();
    state.script = [{ hangAfter: "Here's a weekly coaching plan to grow" }, { hangAfter: "Here's a weekly" }];
    const { seen } = await onFakeClock(() => cardOrContent(question), [60_000, 60_000]);

    expect(seen).toEqual({ card: PLAIN_CARD });
  });
});
