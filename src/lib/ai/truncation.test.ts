import { afterEach, describe, expect, it, vi } from "vitest";

import { __setAnthropicClient } from "./anthropic";
import { callClaude } from "./call-claude";
import { AiError } from "./errors";
import { retryBudget, TRUNCATION_RETRY_CEILING, wasTruncated, withTruncationRetry } from "./truncation";

/**
 * A RESPONSE CUT OFF AT `max_tokens` IS NEVER USED AS IF IT WERE COMPLETE.
 * Retried once with a larger budget; a second cut-off is a clear error. See
 * `truncation.ts`.
 */

const quiet = () => vi.spyOn(console, "warn").mockImplementation(() => {});

afterEach(() => {
  __setAnthropicClient(null);
  vi.restoreAllMocks();
});

describe("the rule", () => {
  it("reads only stop_reason", () => {
    expect(wasTruncated({ stop_reason: "max_tokens" })).toBe(true);
    for (const reason of ["end_turn", "tool_use", "stop_sequence", "refusal", null, undefined]) {
      expect(wasTruncated({ stop_reason: reason })).toBe(false);
    }
  });

  it("doubles the budget on the retry, within the ceiling", () => {
    expect(retryBudget(4096)).toBe(8192);
    expect(retryBudget(12_000)).toBe(TRUNCATION_RETRY_CEILING);
    expect(retryBudget(TRUNCATION_RETRY_CEILING)).toBe(TRUNCATION_RETRY_CEILING);
  });

  it("returns a complete response with one call", async () => {
    const call = vi.fn(async () => ({ stop_reason: "end_turn", text: "whole" }));
    await expect(withTruncationRetry(100, call, "m")).resolves.toMatchObject({ text: "whole" });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("retries a cut-off response once, with more room, and uses only the retry", async () => {
    quiet();
    const call = vi
      .fn()
      .mockResolvedValueOnce({ stop_reason: "max_tokens", text: "half a sent" })
      .mockResolvedValueOnce({ stop_reason: "end_turn", text: "the whole answer" });
    await expect(withTruncationRetry(1024, call, "m")).resolves.toMatchObject({ text: "the whole answer" });
    expect(call.mock.calls.map(([budget]) => budget)).toEqual([1024, 2048]);
  });

  it("throws 'truncated' with the caller's message when the retry is cut off too, and calls no third time", async () => {
    quiet();
    const call = vi.fn(async () => ({ stop_reason: "max_tokens" }));
    const error = await withTruncationRetry(1024, call, "Nothing was written.").catch((caught) => caught);
    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ code: "truncated", status: 502, message: "Nothing was written." });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("does not retry at the ceiling, where more room is not available", async () => {
    quiet();
    const call = vi.fn(async () => ({ stop_reason: "max_tokens" }));
    await expect(withTruncationRetry(TRUNCATION_RETRY_CEILING, call, "m")).rejects.toMatchObject({ code: "truncated" });
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe("a chat answer", () => {
  const INPUT = { system: "s", grounding: "g", history: [], question: "q", maxTokens: 1024 };

  function replies(...responses: { stop_reason: string; text: string }[]) {
    const budgets: number[] = [];
    let index = 0;
    __setAnthropicClient({
      messages: {
        create: async (params: { max_tokens: number }) => {
          budgets.push(params.max_tokens);
          const response = responses[Math.min(index++, responses.length - 1)]!;
          return { stop_reason: response.stop_reason, content: [{ type: "text", text: response.text }] };
        },
      },
    } as never);
    return budgets;
  }

  it("never shows the cut-off half: the retry's full answer is returned", async () => {
    quiet();
    const budgets = replies(
      { stop_reason: "max_tokens", text: "Per the manual, employees must give two" },
      { stop_reason: "end_turn", text: "Per the manual, employees must give two weeks' notice." },
    );
    await expect(callClaude(INPUT)).resolves.toBe("Per the manual, employees must give two weeks' notice.");
    expect(budgets).toEqual([1024, 2048]);
  });

  it("is a 'truncated' error, not a partial answer, when both are cut off", async () => {
    quiet();
    replies({ stop_reason: "max_tokens", text: "Per the manual, employees must" });
    const error = await callClaude(INPUT).catch((caught) => caught);
    expect(error).toBeInstanceOf(AiError);
    expect(error.code).toBe("truncated");
    expect(error.message).toMatch(/ran out of room before finishing that answer, so it was not shown/);
    expect(error.message).not.toContain("Per the manual");
  });
});

/*
 * The sibling app's live QA, 1 Nov 2026: a cut-off briefing took about 31 s and
 * its retry 36 s. TRUNCATION_RETRY_BUDGET_ENABLED: a first attempt that already
 * took over 50 s starts no retry.
 */
describe("TRUNCATION_RETRY_BUDGET: a slow first attempt starts no retry", () => {
  afterEach(() => {
    delete process.env.TRUNCATION_RETRY_BUDGET_ENABLED;
    vi.useRealTimers();
  });

  function calls(firstTakesMs: number) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T10:16:02Z"));
    const budgets: number[] = [];
    const call = async (maxTokens: number) => {
      budgets.push(maxTokens);
      if (budgets.length === 1) {
        vi.setSystemTime(Date.now() + firstTakesMs);
        return { stop_reason: "max_tokens", text: "cut" };
      }
      return { stop_reason: "end_turn", text: "whole" };
    };
    return { call, budgets };
  }

  it("off: a first attempt of 55 s is still retried", async () => {
    quiet();
    const { call, budgets } = calls(55_000);
    await expect(withTruncationRetry(2048, call, "m")).resolves.toMatchObject({ text: "whole" });
    expect(budgets).toEqual([2048, 4096]);
  });

  it("on: a first attempt of 55 s is not retried, and the caller's message says so", async () => {
    quiet();
    process.env.TRUNCATION_RETRY_BUDGET_ENABLED = "true";
    const { call, budgets } = calls(55_000);
    await expect(withTruncationRetry(2048, call, "Nothing was shown.")).rejects.toMatchObject({ code: "truncated", message: "Nothing was shown." });
    expect(budgets).toEqual([2048]);
  });

  it("on: a 31 s first attempt is still retried", async () => {
    quiet();
    process.env.TRUNCATION_RETRY_BUDGET_ENABLED = "true";
    const { call, budgets } = calls(31_000);
    await expect(withTruncationRetry(2048, call, "m")).resolves.toMatchObject({ text: "whole" });
    expect(budgets).toEqual([2048, 4096]);
  });
});
