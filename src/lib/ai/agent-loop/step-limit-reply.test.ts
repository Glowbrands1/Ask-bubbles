import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { cardMadeLine, stepLimitReply } from "./run";

/*
 * QA's live re-test (21 Nov 2026, Pau's account): after "Create the coaching form with the information given. Her name is
 * <First> <Lasty> and she is at Dodge. She is a makery associate" and "she is at Omaha dodge", the step-limit reply asked
 * "Please send the change you still need again" though the card held the change. Invented person (the loop cases' roster).
 */
const DONE = "Here is the **Coaching Form** for **Thaddea Kroll** for you to review.";

describe("stepLimitReply with a card made this turn", () => {
  it("says what the card's result recorded changed, its person and store, and never asks for the change again", () => {
    const reply = stepLimitReply(DONE, false, { form: "Coaching Form", employee: "Thaddea Kroll", store: "Omaha, NE (West Dodge Rd)", formFrom: "Corrective Action Form", nameFrom: "Thaddea Krol" });
    expect(reply).toBe(`${DONE} I changed the form from the Corrective Action Form to the Coaching Form, and the name from Thaddea Krol to Thaddea Kroll. The card is for Thaddea Kroll at Omaha, NE (West Dodge Rd). Tell me if anything else on the card should change.`);
    expect(reply).not.toMatch(/again/);
  });
  it("with nothing changed, still confirms the card's person and store", () => {
    expect(cardMadeLine({ form: "Coaching Form", employee: "Thaddea Kroll", store: "Omaha, NE (West Dodge Rd)", formFrom: null, nameFrom: null })).toBe("The card is for Thaddea Kroll at Omaha, NE (West Dodge Rd).");
  });
  it("no card this turn: unchanged (a saved edit, or nothing done)", () => {
    expect(stepLimitReply("I saved the change on the form: Observed.", true)).toBe("I saved the change on the form: Observed. Please send the change you still need again, and I'll make it.");
  });
});
