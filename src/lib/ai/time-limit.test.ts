import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AiError } from "./errors";
import { runInAiRoute, aiRequestStartedAt, currentAiRoute } from "./ai-route";
import {
  AI_TIMEOUT_MESSAGE,
  AiTimeLimitError,
  deadlineAwareTotalMs,
  describeAiError,
  withAiTimeLimit,
  withStreamTimeLimit,
  type TimedCallOptions,
} from "./time-limit";
import { AI_MAX_RETRIES, deadlineMarginMs, helperTimeoutMs, mainAnswerTimeoutMs, routeMaxMs } from "@/lib/config/ai-timeouts";

/*
 * Ported from Ask Sunny (src/lib/ai/time-limit.test.ts @ 057a6c6, Sunny PR #995, read at 2aa544d8): the helper-only
 * parts — the timer, the abort and the deadline math. Sunny's cases that drive `callClaude`, `callClaudeTool` and the
 * reader through the helpers are left out: in this app nothing is wired to these helpers yet.
 */

let errors: { mock: { calls: unknown[][] } };
const ENV = ["AI_MAIN_TIMEOUT_MS", "AI_HELPER_TIMEOUT_MS", "AI_ROUTE_MAX_MS", "AI_DEADLINE_MARGIN_MS"] as const;

beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const name of ENV) delete process.env[name];
});

function loggedLines(): string[] {
  return errors.mock.calls.map((call: unknown[]) => String(call[0]));
}

describe("withAiTimeLimit", () => {
  it("a call that ignores its signal is no longer waited on", async () => {
    vi.useFakeTimers();
    const settled = withAiTimeLimit("x", 1_000, () => new Promise(() => {})).then(() => null, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await settled).toBeInstanceOf(AiTimeLimitError);
  });

  it("a call in time returns its value, logs nothing, and leaves no timer behind", async () => {
    vi.useFakeTimers();
    expect(await withAiTimeLimit("x", 1_000, async () => 7)).toBe(7);
    expect(vi.getTimerCount()).toBe(0);
    expect(errors).not.toHaveBeenCalled();
  });

  it("at the limit: the signal aborts, the error carries the message to show (504), and one log line names only code", async () => {
    vi.useFakeTimers();
    let seen: TimedCallOptions | null = null;
    const settled = runInAiRoute("chat", () =>
      withAiTimeLimit("record_intent_slots", 30_000, (options) => {
        seen = options;
        return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(new Error("Request was aborted."))));
      }),
    ).then(() => null, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(errors).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const error = await settled;
    expect(error).toBeInstanceOf(AiTimeLimitError);
    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).message).toBe(AI_TIMEOUT_MESSAGE);
    expect((error as AiError).status).toBe(504);
    expect((error as AiError).code).toBe("model_failed");
    expect(seen!.signal.aborted).toBe(true);
    expect(seen!.timeout).toBe(30_000);
    expect(seen!.maxRetries).toBe(AI_MAX_RETRIES);
    expect(loggedLines()).toEqual([expect.stringMatching(/^\[ai\.timeout\] route=chat call=record_intent_slots duration_ms=\d+ limit_ms=30000$/)]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a stream the abort ends quietly still settles on the timeout, never an empty answer", async () => {
    vi.useFakeTimers();
    const settled = withAiTimeLimit("main_answer", 5_000, (options) =>
      new Promise<string>((resolve) => options.signal.addEventListener("abort", () => resolve(""))),
    ).then((value) => value, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await settled).toBeInstanceOf(AiTimeLimitError);
  });

  it("a failure before the limit is passed through unchanged and is not a timeout", async () => {
    const failure = new AiError("model_failed", "nope");
    await expect(withAiTimeLimit("x", 1_000, async () => { throw failure; })).rejects.toBe(failure);
    expect(errors).not.toHaveBeenCalled();
  });

  it("a caller may set its own retry count", async () => {
    let seen: TimedCallOptions | null = null;
    await withAiTimeLimit("x", 1_000, async (options) => { seen = options; return 1; }, { maxRetries: 0 });
    expect(seen!.maxRetries).toBe(0);
  });
});

describe("withStreamTimeLimit", () => {
  const LIMITS = { firstTokenMs: 45_000, gapMs: 30_000, totalMs: 110_000 };

  it("no first token: ends at the first-token limit (limit=first_token)", async () => {
    vi.useFakeTimers();
    const settled = withStreamTimeLimit("main_answer", LIMITS, (options) =>
      new Promise((resolve) => options.signal.addEventListener("abort", () => resolve("")))).then(() => null, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(44_999);
    expect(errors).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const error = await settled;
    expect(error).toBeInstanceOf(AiTimeLimitError);
    expect((error as AiTimeLimitError).kind).toBe("first_token");
    expect(loggedLines()).toEqual([expect.stringMatching(/^\[ai\.timeout\] route=unknown call=main_answer duration_ms=\d+ limit_ms=45000 limit=first_token$/)]);
  });

  it("a long answer that keeps streaming is never cut short, and leaves no timer behind", async () => {
    vi.useFakeTimers();
    const settled = withStreamTimeLimit("main_answer", LIMITS, async (_options, watch) => {
      await new Promise((resolve) => setTimeout(resolve, 40_000));
      watch.firstToken();
      for (let i = 0; i < 4; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        watch.chunk();
      }
      return "done";
    });
    await vi.advanceTimersByTimeAsync(61_000);
    expect(await settled).toBe("done");
    expect(errors).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a stream that goes quiet ends one gap after its last chunk (limit=gap)", async () => {
    vi.useFakeTimers();
    const settled = withStreamTimeLimit("main_answer", LIMITS, async (options, watch) => {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      watch.firstToken();
      return new Promise((resolve) => options.signal.addEventListener("abort", () => resolve("")));
    }).then(() => null, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_000 + 29_999);
    expect(errors).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect((await settled as AiTimeLimitError).kind).toBe("gap");
  });

  it("a new attempt waits for its own first token again", async () => {
    vi.useFakeTimers();
    const settled = withStreamTimeLimit("main_answer", LIMITS, async (options, watch) => {
      watch.firstToken();
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      watch.attempt();
      return new Promise((resolve) => options.signal.addEventListener("abort", () => resolve("")));
    }).then(() => null, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(20_000 + 44_999);
    expect(errors).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect((await settled as AiTimeLimitError).kind).toBe("first_token");
  });

  it("a stream that never ends stops at its total (limit=total)", async () => {
    vi.useFakeTimers();
    const settled = withStreamTimeLimit("main_answer", LIMITS, async (options, watch) => {
      watch.firstToken();
      while (!options.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        watch.chunk();
      }
      return "";
    }).then(() => null, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(109_999);
    expect(errors).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const error = await settled as AiTimeLimitError;
    expect(error.kind).toBe("total");
    expect(error.limitMs).toBe(110_000);
  });
});

describe("the deadline math", () => {
  it("outside a route the total is as given", () => {
    expect(aiRequestStartedAt()).toBeNull();
    expect(currentAiRoute()).toBe("unknown");
    expect(deadlineAwareTotalMs(110_000)).toBe(110_000);
  });

  it("inside a route the total is cut to what is left before maxDuration less the margin: 120 − 8 − 40 = 72 s", async () => {
    vi.useFakeTimers();
    await runInAiRoute("chat", async () => {
      const started = aiRequestStartedAt()!;
      expect(currentAiRoute()).toBe("chat");
      expect(deadlineAwareTotalMs(110_000, started + 40_000)).toBe(72_000);
      // A shorter total than what is left stays as given.
      expect(deadlineAwareTotalMs(30_000, started + 40_000)).toBe(30_000);
      // Never below one second, even past the deadline.
      expect(deadlineAwareTotalMs(110_000, started + 200_000)).toBe(1_000);
    });
  });

  it("AI_ROUTE_MAX_MS and AI_DEADLINE_MARGIN_MS move the deadline; out of range they are the default", async () => {
    process.env.AI_ROUTE_MAX_MS = "60000";
    process.env.AI_DEADLINE_MARGIN_MS = "5000";
    await runInAiRoute("chat", async () => {
      expect(deadlineAwareTotalMs(110_000, aiRequestStartedAt()! + 10_000)).toBe(45_000);
    });
    process.env.AI_ROUTE_MAX_MS = "5";
    process.env.AI_DEADLINE_MARGIN_MS = "lots";
    expect(routeMaxMs()).toBe(120_000);
    expect(deadlineMarginMs()).toBe(8_000);
  });

  it("each limit reads its variable within its range, else the default", () => {
    expect(mainAnswerTimeoutMs()).toBe(45_000);
    process.env.AI_MAIN_TIMEOUT_MS = "6000";
    expect(mainAnswerTimeoutMs()).toBe(6_000);
    process.env.AI_MAIN_TIMEOUT_MS = "1";
    expect(mainAnswerTimeoutMs()).toBe(45_000);
    process.env.AI_HELPER_TIMEOUT_MS = " ";
    expect(helperTimeoutMs()).toBe(30_000);
  });
});

describe("describeAiError", () => {
  it("names status, type and class only, never the message (it can echo the request)", () => {
    const sdk = Object.assign(new Error("echo of the request: dress code"), { status: 529, error: { type: "overloaded_error" } });
    expect(describeAiError(sdk)).toBe("HTTP 529 overloaded_error Error");
    expect(describeAiError(new AiError("model_failed", "secret", 502))).toBe("AiError model_failed 502");
    expect(describeAiError(null)).toBe("unknown");
  });
});
