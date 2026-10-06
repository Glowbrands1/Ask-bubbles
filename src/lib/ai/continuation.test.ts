import { describe, expect, it } from "vitest";

import { findContinuationAnchor, gateTexts, isEllipticalFollowUp } from "./continuation";

const turns = (...pairs: [string, string][]) => pairs.map(([role, content]) => ({ role, content }));

describe("a follow-up and the turn it hangs off", () => {
  it.each(["and part-timers?", "what about weekends?", "Why?", "Sarah and Jane?", "based on that, what should I do?", "same for closing"])(
    "%s is a fragment",
    (question) => expect(isEllipticalFollowUp(question)).toBe(true),
  );

  it.each(["What does the refund policy say?", "Rank my team.", "Based on those numbers, what was our total?", "According to this policy, what is the refund window?"])(
    "%s stands on its own",
    (question) => expect(isEllipticalFollowUp(question)).toBe(false),
  );

  it("walks back over fragments to the nearest standalone manager turn, never an answer", () => {
    const history = turns(
      ["user", "What is the attendance policy?"],
      ["assistant", "Team members must arrive on time."],
      ["user", "and for part-timers?"],
      ["assistant", "The same rule applies."],
    );
    expect(findContinuationAnchor(history)).toBe("What is the attendance policy?");
  });

  it("gives up after the bounded number of fragments", () => {
    const history = turns(["user", "What is the attendance policy?"], ...Array.from({ length: 8 }, () => ["user", "and?"] as [string, string]));
    expect(findContinuationAnchor(history)).toBeNull();
  });

  it("a gate tests a fragment together with its anchor, and a whole question alone", () => {
    const history = turns(["user", "What is the attendance policy?"], ["assistant", "…"]);
    expect(gateTexts("and for part-timers?", history)).toEqual(["and for part-timers?", "What is the attendance policy?"]);
    expect(gateTexts("What is the refund policy?", history)).toEqual(["What is the refund policy?"]);
  });
});

import { followUpRetrievalEnabled, mergeRetrieved, retrievalPlan, searchWithPlan } from "./continuation";

describe("what retrieval searches for a follow-up", () => {
  const history = turns(
    ["user", "What does the attendance policy say about arriving late?"],
    ["assistant", "Call the manager on duty two hours before. (SYNTHETIC ANSWER WORDING)"],
  );

  it("a fragment is searched as typed, with its anchor kept as the fallback", () => {
    expect(retrievalPlan("and for part-timers?", history, true)).toEqual({
      queries: ["and for part-timers?"],
      fallback: "What does the attendance policy say about arriving late?\nand for part-timers?",
      anchor: "What does the attendance policy say about arriving late?",
    });
  });

  it("never embeds an assistant answer", () => {
    expect(retrievalPlan("and for part-timers?", history, true).fallback).not.toContain("SYNTHETIC");
  });

  it("a question that stands on its own is searched exactly as typed, with no fallback", () => {
    expect(retrievalPlan("What is the break policy?", history, true)).toEqual({ queries: ["What is the break policy?"], fallback: null, anchor: null });
  });

  it("has no fallback when switched off, or with nothing to anchor to", () => {
    expect(retrievalPlan("and for part-timers?", history, false).fallback).toBeNull();
    expect(retrievalPlan("and for part-timers?", [], true).fallback).toBeNull();
  });

  it("uses the fallback only when the question alone found nothing", async () => {
    const plan = retrievalPlan("and for part-timers?", history, true);
    const searched: string[] = [];
    const found = (rows: { chunk_id: string; similarity: number }[]) => async (query: string) => {
      searched.push(query);
      return query === plan.fallback ? [{ chunk_id: "faq", similarity: 0.9 }] : rows;
    };
    expect(await searchWithPlan(plan, found([{ chunk_id: "own", similarity: 0.8 }]), 14)).toEqual([{ chunk_id: "own", similarity: 0.8 }]);
    expect(searched).toEqual(["and for part-timers?"]);
    searched.length = 0;
    expect(await searchWithPlan(plan, found([]), 14)).toEqual([{ chunk_id: "faq", similarity: 0.9 }]);
    expect(searched).toEqual(["and for part-timers?", plan.fallback]);
  });

  it("reads the switch: on unless KNOWLEDGE_FOLLOW_UP_RETRIEVAL=off", () => {
    expect(followUpRetrievalEnabled({})).toBe(true);
    expect(followUpRetrievalEnabled({ KNOWLEDGE_FOLLOW_UP_RETRIEVAL: "off" })).toBe(false);
    expect(followUpRetrievalEnabled({ KNOWLEDGE_FOLLOW_UP_RETRIEVAL: " OFF " })).toBe(false);
  });

  it("merges result sets: each chunk once, at its best similarity, best first, capped", () => {
    const a = [{ chunk_id: "x", similarity: 0.5 }, { chunk_id: "y", similarity: 0.9 }];
    const b = [{ chunk_id: "x", similarity: 0.8 }, { chunk_id: "z", similarity: 0.6 }];
    expect(mergeRetrieved([a, b], 2)).toEqual([{ chunk_id: "y", similarity: 0.9 }, { chunk_id: "x", similarity: 0.8 }]);
  });
});
