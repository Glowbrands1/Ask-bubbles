import { afterEach, describe, expect, it, vi } from "vitest";

import { Anthropic, __setAnthropicClient } from "./anthropic";
import { callClaude } from "./call-claude";
import { runChatTrace, type ChatTraceDraft } from "./chat-trace-store";
import { AiError } from "./errors";

/**
 * THE LIVE CLIENT ALWAYS HAS messages.stream. Streaming whenever that
 * method exists would change production with every flag off. Stream only
 * when CHAT_TRACE_ENABLED or PROMPT_CACHE_ENABLED is on. Truncation still
 * retries once on whichever path the flags select.
 */

const INPUT = { system: "s", grounding: "g", history: [], question: "q", maxTokens: 1024 };
const SECRET = "GROUNDING-TEXT-THAT-MUST-NOT-BE-LOGGED";

interface Reply {
  readonly stop_reason: string;
  readonly text: string;
  /** Clock advance before the text event, so firstTokenMs is this attempt's wait. */
  readonly beforeTextMs: number;
}

function quiet() {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
}

function draft(): ChatTraceDraft {
  return {
    startedAt: 0,
    conversationId: null,
    messageId: null,
    userId: null,
    originalQuery: "q",
    rewrittenQuery: null,
    intent: null,
    retrievalCount: null,
    retrieved: [],
    prompt: null,
    formInProgress: false,
    modelCall: null,
    errorSubtype: null,
    errorClass: null,
    errorStatus: null,
    succeeded: null,
  };
}

function install(input: {
  replies?: readonly Reply[];
  error?: Error;
  /** Fire a text event, then reject. The partial text must not leave callClaude. */
  textBeforeError?: { text: string; beforeTextMs: number };
}) {
  const createBudgets: number[] = [];
  const streamBudgets: number[] = [];
  let index = 0;
  let now = 10_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);

  function nextReply(): Reply {
    const replies = input.replies ?? [];
    const response = replies[Math.min(index, replies.length - 1)];
    index += 1;
    if (!response) throw new Error("no reply");
    return response;
  }

  __setAnthropicClient({
    messages: {
      create: async (params: { max_tokens: number }) => {
        createBudgets.push(params.max_tokens);
        if (input.error && !input.replies) throw input.error;
        const response = nextReply();
        now += response.beforeTextMs;
        return {
          stop_reason: response.stop_reason,
          content: [{ type: "text", text: response.text }],
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      },
      stream(params: { max_tokens: number }) {
        streamBudgets.push(params.max_tokens);
        const handlers = new Map<string, Array<() => void>>();
        return {
          on(event: string, cb: () => void) {
            const list = handlers.get(event) ?? [];
            list.push(cb);
            handlers.set(event, list);
          },
          async finalMessage() {
            if (input.error && !input.replies) {
              if (input.textBeforeError) {
                now += input.textBeforeError.beforeTextMs;
                for (const cb of handlers.get("text") ?? []) cb();
              }
              throw input.error;
            }
            const response = nextReply();
            now += response.beforeTextMs;
            for (const cb of handlers.get("text") ?? []) cb();
            return {
              stop_reason: response.stop_reason,
              content: [{ type: "text", text: response.text }],
              usage: { input_tokens: 3, output_tokens: 2 },
            };
          },
        };
      },
    },
  } as never);

  return { createBudgets, streamBudgets };
}

async function asked(): Promise<{ text: string; trace: ChatTraceDraft }> {
  const trace = draft();
  const text = await runChatTrace(trace, () => callClaude(INPUT));
  return { text, trace };
}

afterEach(() => {
  __setAnthropicClient(null);
  delete process.env.CHAT_TRACE_ENABLED;
  delete process.env.PROMPT_CACHE_ENABLED;
  vi.restoreAllMocks();
});

describe("flags off stay on messages.create", () => {
  it("calls create and does not call stream when both methods exist", async () => {
    const calls = install({
      replies: [{ stop_reason: "end_turn", text: "The handbook allows it.", beforeTextMs: 40 }],
    });
    const { text, trace } = await asked();
    expect(text).toBe("The handbook allows it.");
    expect(calls.createBudgets).toEqual([1024]);
    expect(calls.streamBudgets).toEqual([]);
    expect(trace.modelCall?.firstTokenMs).toBeNull();
  });

  it("still retries a cut-off create once, and still does not stream", async () => {
    quiet();
    const calls = install({
      replies: [
        { stop_reason: "max_tokens", text: "Per the manual, employees must", beforeTextMs: 40 },
        { stop_reason: "end_turn", text: "Per the manual, employees must give two weeks' notice.", beforeTextMs: 7 },
      ],
    });
    const { text, trace } = await asked();
    expect(text).toBe("Per the manual, employees must give two weeks' notice.");
    expect(calls.createBudgets).toEqual([1024, 2048]);
    expect(calls.streamBudgets).toEqual([]);
    expect(trace.modelCall?.firstTokenMs).toBeNull();
  });
});

describe("a stream, only when a flag is on", () => {
  it("CHAT_TRACE_ENABLED returns the streamed text and the first-token wait", async () => {
    process.env.CHAT_TRACE_ENABLED = "1";
    const calls = install({
      replies: [{ stop_reason: "end_turn", text: "Give two weeks' notice.", beforeTextMs: 12 }],
    });
    const { text, trace } = await asked();
    expect(text).toBe("Give two weeks' notice.");
    expect(calls.streamBudgets).toEqual([1024]);
    expect(calls.createBudgets).toEqual([]);
    expect(trace.modelCall?.firstTokenMs).toBe(12);
  });

  it("PROMPT_CACHE_ENABLED alone also streams", async () => {
    process.env.PROMPT_CACHE_ENABLED = "1";
    const calls = install({
      replies: [{ stop_reason: "end_turn", text: "Cached path.", beforeTextMs: 3 }],
    });
    await expect(callClaude(INPUT)).resolves.toBe("Cached path.");
    expect(calls.streamBudgets).toEqual([1024]);
    expect(calls.createBudgets).toEqual([]);
  });

  it("an error mid-stream is model_failed and does not echo the request", async () => {
    process.env.CHAT_TRACE_ENABLED = "1";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    install({ error: new Error(`echo of ${SECRET}`) });
    const error = await callClaude(INPUT).catch((caught) => caught);
    expect(error).toBeInstanceOf(AiError);
    expect(error.code).toBe("model_failed");
    expect(error.message).toMatch(/could not reach the language model/);
    expect(error.message).not.toContain(SECRET);
    const logged = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toContain("class=Error");
    expect(logged).not.toContain(SECRET);
  });

  it("an error after partial text does not return that text", async () => {
    process.env.CHAT_TRACE_ENABLED = "1";
    const partial = "PARTIAL-ANSWER-THAT-MUST-NOT-BE-SHOWN";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    install({
      error: new Error(`echo of ${SECRET}`),
      textBeforeError: { text: partial, beforeTextMs: 9 },
    });
    const trace = draft();
    const error = await runChatTrace(trace, () => callClaude(INPUT)).catch((caught) => caught);
    expect(error).toBeInstanceOf(AiError);
    expect(error.code).toBe("model_failed");
    expect(error.message).toMatch(/could not reach the language model/);
    expect(error.message).not.toContain(partial);
    expect(error.message).not.toContain(SECRET);
    expect(trace.modelCall?.firstTokenMs).toBeNull();
    const logged = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).not.toContain(partial);
    expect(logged).not.toContain(SECRET);
  });

  it("an Anthropic error with a status is configuration when the status says so, and the status is logged", async () => {
    process.env.CHAT_TRACE_ENABLED = "1";
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = Anthropic.APIError.generate(
      401,
      { type: "error", error: { type: "authentication_error", message: `echo of ${SECRET}` } },
      `echo of ${SECRET}`,
      new Headers({ "request-id": "req_stream_401" }),
    );
    install({ error: failure });
    const error = await callClaude(INPUT).catch((caught) => caught);
    expect(error).toBeInstanceOf(AiError);
    expect(error.code).toBe("not_configured");
    expect(error.message).toContain("HTTP 401");
    expect(error.message).not.toContain(SECRET);
    const logged = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toContain("status=401");
    expect(logged).toContain("type=authentication_error");
    expect(logged).toContain("request_id=req_stream_401");
    expect(logged).not.toContain(SECRET);
  });

  it("retries a cut-off stream once and keeps the retry's first-token wait", async () => {
    quiet();
    process.env.PROMPT_CACHE_ENABLED = "1";
    const calls = install({
      replies: [
        { stop_reason: "max_tokens", text: "Per the manual, employees must", beforeTextMs: 40 },
        { stop_reason: "end_turn", text: "Per the manual, employees must give two weeks' notice.", beforeTextMs: 7 },
      ],
    });
    const { text, trace } = await asked();
    expect(text).toBe("Per the manual, employees must give two weeks' notice.");
    expect(calls.streamBudgets).toEqual([1024, 2048]);
    expect(calls.createBudgets).toEqual([]);
    expect(trace.modelCall?.firstTokenMs).toBe(7);
  });

  it("a flag on with no stream method still uses create", async () => {
    process.env.CHAT_TRACE_ENABLED = "1";
    const budgets: number[] = [];
    __setAnthropicClient({
      messages: {
        create: async (params: { max_tokens: number }) => {
          budgets.push(params.max_tokens);
          return { stop_reason: "end_turn", content: [{ type: "text", text: "Created." }] };
        },
      },
    } as never);
    await expect(callClaude(INPUT)).resolves.toBe("Created.");
    expect(budgets).toEqual([1024]);
  });
});
