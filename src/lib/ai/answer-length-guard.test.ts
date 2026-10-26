import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANSWER_GUARD_MAX_TOKENS,
  answerLengthGuard,
  answerLengthRetry,
  cutAtLastComplete,
  type AnswerLengthGuard,
} from "./answer-length-guard";

/**
 * The cut and the timing rules of ANSWER_LENGTH_GUARD_ENABLED, without a model.
 * The sibling app's production reply ended "…so the rest of the team can copy
 * it [S5"; the runtime suite follows QA's turn through callClaude. Here the
 * guard stands in for `withTruncationRetry` on the answer call.
 */

interface Message {
  readonly stop_reason: string | null;
  readonly content: readonly { readonly type: string; readonly text: string }[];
  readonly usage: unknown;
}

/** What callClaude reads from the settled reply. */
interface Settled {
  readonly text: string;
  readonly stopReason: string | null;
  /** True when the first reply came back as the same object. */
  readonly same: boolean;
}

function reply(text: string, stopReason: string): Message {
  return { stop_reason: stopReason, content: [{ type: "text", text }], usage: null };
}

/** The guard as callClaude runs it: the first reply, then `again` for any later call. */
async function settleAnswer(
  guard: AnswerLengthGuard,
  first: Message,
  again: () => Promise<Message>,
): Promise<Settled> {
  let calls = 0;
  const settled = await answerLengthRetry(guard)(
    guard.maxTokens,
    async (maxTokens) => {
      expect(maxTokens).toBe(guard.maxTokens);
      calls += 1;
      return calls === 1 ? first : again();
    },
    "unused: the guard never throws truncated",
  );
  return {
    text: settled.content.map((block) => block.text).join("\n").trim(),
    stopReason: settled.stop_reason,
    same: settled === first,
  };
}

function guardAt(elapsedMs: number): AnswerLengthGuard {
  return { maxTokens: ANSWER_GUARD_MAX_TOKENS, turnStartedAt: Date.now() - elapsedMs };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the cut ends on a whole sentence or a whole list item", () => {
  it("drops the production reply's unfinished sentence and its unclosed [S5", () => {
    const text =
      "Share the wording that worked best [S4]. Do it at every huddle so the rest of the team can copy it [S5";
    expect(cutAtLastComplete(text)).toBe("Share the wording that worked best [S4].");
  });

  it("drops a bare unclosed [S as well", () => {
    expect(cutAtLastComplete("Track every sign-up. Review the numbers each week [S")).toBe("Track every sign-up.");
  });

  it("a cut inside a bullet goes back to the previous complete item", () => {
    const text = [
      "## Week 1",
      "- Review the offer with the team [S1].",
      "- Role-play the first ask.",
      "- Practise the follow-up question until every",
    ].join("\n");
    expect(cutAtLastComplete(text)).toBe(
      ["## Week 1", "- Review the offer with the team [S1].", "- Role-play the first ask."].join("\n"),
    );
  });

  it("a bullet with a whole sentence in it is still dropped whole when it was cut", () => {
    const text = ["- Ask every customer.", "- Week 2: Track who signed up. Then share the best [S"].join("\n");
    expect(cutAtLastComplete(text)).toBe("- Ask every customer.");
  });

  it("a numbered item cut mid-way goes back to the previous item", () => {
    const text = ["1. Greet the customer.", "2. Explain the membership.", "3. Ask for the"].join("\n");
    expect(cutAtLastComplete(text)).toBe(["1. Greet the customer.", "2. Explain the membership."].join("\n"));
  });

  it("a cut inside a heading goes back to the item before it, with no orphan heading", () => {
    const text = ["## Week 1", "- Ask every customer.", "", "## Week 2: Coach in the"].join("\n");
    expect(cutAtLastComplete(text)).toBe(["## Week 1", "- Ask every customer."].join("\n"));
  });

  it("a whole heading left with nothing under it goes too", () => {
    const text = ["Start with the offer.", "", "## Week 2", "- Track"].join("\n");
    expect(cutAtLastComplete(text)).toBe("Start with the offer.");
  });

  it("a bold label or a lead-in with nothing under it goes too", () => {
    expect(cutAtLastComplete(["Start with the offer.", "**Week 2:**", "- Track"].join("\n"))).toBe(
      "Start with the offer.",
    );
    expect(cutAtLastComplete(["Start with the offer.", "Then do these three things:", "1. Gr"].join("\n"))).toBe(
      "Start with the offer.",
    );
  });

  it("a half-written table row is dropped whole", () => {
    const text = ["| Day | Focus |", "| --- | --- |", "| Mon | Offer |", "| Tue | Fol"].join("\n");
    expect(cutAtLastComplete(text)).toBe(["| Day | Focus |", "| --- | --- |", "| Mon | Offer |"].join("\n"));
  });

  it("keeps a citation after a full stop and a page reference inside a sentence", () => {
    expect(cutAtLastComplete("Ask every customer. [S2] Track it (JBA Policy Manual, p. 19). Then share the")).toBe(
      "Ask every customer. [S2] Track it (JBA Policy Manual, p. 19).",
    );
    expect(cutAtLastComplete("See p. 19 of the manual")).toBe("");
  });

  it("is empty when no sentence or item was finished", () => {
    expect(cutAtLastComplete("Here is a weekly coaching plan so the team can copy it [S5")).toBe("");
  });
});

describe("the second attempt and the turn clock", () => {
  it("an end_turn reply is returned as the same object, and nothing is asked again", async () => {
    const first = reply("Ask every customer [S1].", "end_turn");
    const again = vi.fn();
    const settled = await settleAnswer(guardAt(1_000), first, again);
    expect(settled.same).toBe(true);
    expect(again).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("a cut reply under 35 s is asked for once more, and an end_turn retry is shown whole", async () => {
    const full = reply("Ask every customer. Share what worked so the team can copy it [S5].", "end_turn");
    const again = vi.fn(async () => full);
    const settled = await settleAnswer(
      guardAt(10_000),
      reply("Ask every customer. Share what worked so the team can copy it [S5", "max_tokens"),
      again,
    );
    expect(again).toHaveBeenCalledTimes(1);
    expect(settled.text).toBe("Ask every customer. Share what worked so the team can copy it [S5].");
    expect(settled.stopReason).toBe("end_turn");
  });

  it("both attempts cut: the longer clean cut, with no [S token", async () => {
    const settled = await settleAnswer(
      guardAt(10_000),
      reply("Ask every customer. Share what worked so the team can copy it [S5", "max_tokens"),
      async () => reply("Ask every customer. Track it weekly. Share what [S", "max_tokens"),
    );
    expect(settled.text).toBe("Ask every customer. Track it weekly.");
    expect(settled.stopReason).toBe("max_tokens");
  });

  it("a turn already 40 s old is not retried, and the reply is cut clean", async () => {
    const again = vi.fn();
    const settled = await settleAnswer(
      guardAt(40_000),
      reply("Ask every customer. Share what worked so the team can copy it [S5", "max_tokens"),
      again,
    );
    expect(again).not.toHaveBeenCalled();
    expect(settled.text).toBe("Ask every customer.");
    expect(vi.mocked(console.warn).mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringMatching(/^\[answer-length-guard\] stop_reason=max_tokens max_tokens=3584 elapsed_ms=4\d{4} retried=false outcome=cut/),
    ]);
  });

  it("a retry still running when the turn reaches 60 s is abandoned, and the reply is cut clean", async () => {
    vi.useFakeTimers();
    let done = false;
    const pending = settleAnswer(
      guardAt(30_000),
      reply("Ask every customer. Share what worked so the team can copy it [S5", "max_tokens"),
      () => new Promise<Message>(() => {}),
    ).then((settled) => {
      done = true;
      return settled;
    });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const settled = await pending;
    expect(settled.text).toBe("Ask every customer.");
  });

  it("a retry that fails falls back to the clean cut instead of failing the turn", async () => {
    const settled = await settleAnswer(
      guardAt(5_000),
      reply("Ask every customer. Share what [S", "max_tokens"),
      async () => {
        throw new Error("overloaded");
      },
    );
    expect(settled.text).toBe("Ask every customer.");
  });

  it("a refused retry is not shown; the first reply is cut clean", async () => {
    const settled = await settleAnswer(
      guardAt(5_000),
      reply("Ask every customer. Share what [S", "max_tokens"),
      async () => reply("", "refusal"),
    );
    expect(settled.text).toBe("Ask every customer.");
  });
});

describe("the guard exists only for the chat answer with the flag on", () => {
  it("is null with the flag off, or for a caller that did not ask for it", () => {
    vi.stubEnv("ANSWER_LENGTH_GUARD_ENABLED", "");
    expect(answerLengthGuard({ maxTokens: 2048, answerLengthGuard: true })).toBeNull();
    vi.stubEnv("ANSWER_LENGTH_GUARD_ENABLED", "true");
    expect(answerLengthGuard({ maxTokens: 2048 })).toBeNull();
  });

  it("raises 2048 to 3584 and leaves the quick and detailed budgets alone", () => {
    vi.stubEnv("ANSWER_LENGTH_GUARD_ENABLED", "true");
    expect(answerLengthGuard({ maxTokens: 2048, answerLengthGuard: true })?.maxTokens).toBe(3584);
    expect(answerLengthGuard({ maxTokens: 1024, answerLengthGuard: true })?.maxTokens).toBe(1024);
    expect(answerLengthGuard({ maxTokens: 4096, answerLengthGuard: true })?.maxTokens).toBe(4096);
  });
});
