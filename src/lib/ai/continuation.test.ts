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
