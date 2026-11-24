import { describe, expect, it } from "vitest";

import { readExitDetails } from "./exit-details";

/*
 * QA's live re-test B6 (21 Nov 2026, Pau's account, agent loop on, production 3e2c30dd): "The Reason field was saved as
 * \"Second job I'm ready for the draft.\" — the trailing \"I'm ready for the draft\" is an instruction, not part of the
 * reason." Expected: "Second job". A reason ends where the manager's words to the app begin, by their shape (readiness,
 * the go-ahead, a request about the draft or form), never one phrase.
 */
const TODAY = "2026-11-21";
const reason = (said: string) => readExitDetails(said, TODAY).resignationReason;

describe("a reason ends where the words to the app begin (B6, item 21)", () => {
  it("QA's words", () => {
    expect(reason("she is resigning due to second job I'm ready for the draft")).toBe("Second job.");
  });
  it.each([
    "she is resigning due to second job go ahead and create it",
    "she is resigning due to second job make the draft",
    "she is resigning due to second job, please create the exit form",
    "she is resigning due to second job we're all set",
    "she is resigning due to second job I am ready",
    "she is resigning due to second job ready for the draft",
  ])("%s", (said) => {
    expect(reason(said)).toBe("Second job.");
  });
  it.each([
    ["she quit to start a new job", "To start a new job."],
    ["she is resigning due to family moving away", "Family moving away."],
    ["she is resigning because she wants to make more money", "She wants to make more money."],
  ])("a reason with no words to the app stays whole: %s", (said, kept) => {
    expect(reason(said)).toBe(kept);
  });
});
