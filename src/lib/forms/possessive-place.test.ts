import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { onlyAsPossessivePlace, withPossessivePlaceNotPerson } from "./possessive-place";

/** POSSESSIVE_PLACE_NOT_PERSON_ENABLED. QA, the Bubbles round-6 live test (9 Nov 2026), in QA's wording. */
const REPORTED = "create a CA for Lee's Summit Plaza, she was late on 10-20-26";
const card = (employeeName: string) => ({
  content: `I'll draft a **Corrective Action Form** for **${employeeName}** from what you've described.`,
  formProposal: { employeeName, templateName: "Corrective Action Form", status: "ready", supportsInlineDraft: true },
});

beforeEach(() => vi.stubEnv("POSSESSIVE_PLACE_NOT_PERSON_ENABLED", "true"));
afterEach(() => vi.unstubAllEnvs());

describe("onlyAsPossessivePlace", () => {
  it("QA's wording: \"Lee\" is only the store's possessive", () => {
    expect(onlyAsPossessivePlace("Lee", REPORTED)).toBe(true);
    expect(onlyAsPossessivePlace("Lee", "create a CA for lees summit… no: for Lee’s Summit, she was late")).toBe(true);
  });

  it("a possessive with a place word: \"<Name>'s Plaza\", \"<Name>'s Crossing Mall\"", () => {
    expect(onlyAsPossessivePlace("Hadley", "write up a coaching form for Hadley's Crossing Mall, late twice")).toBe(true);
  });

  it("a person named plainly anywhere is a person", () => {
    expect(onlyAsPossessivePlace("Lee", "create a CA for Lee, she was late at Lee's Summit Plaza")).toBe(false);
    expect(onlyAsPossessivePlace("Lee", "create a CA for Lee's late arrival on 10-20-26")).toBe(false);
    expect(onlyAsPossessivePlace("Marnie", "create a CA for Marnie's shift at Lee's Summit")).toBe(false);
    expect(onlyAsPossessivePlace("Lee Calder", REPORTED)).toBe(false);
  });
});

describe("withPossessivePlaceNotPerson", () => {
  it("off: the card as it was", () => {
    vi.stubEnv("POSSESSIVE_PLACE_NOT_PERSON_ENABLED", "");
    expect(withPossessivePlaceNotPerson(card("Lee"), [REPORTED]).formProposal?.employeeName).toBe("Lee");
  });

  it("on: QA's wording loses \"Lee\" and asks who the form is for", () => {
    const answer = withPossessivePlaceNotPerson(card("Lee"), [REPORTED]);
    expect(answer.formProposal).toMatchObject({ employeeName: null, status: "needs_employee", supportsInlineDraft: false });
    expect(answer.content).toMatch(/^Who is this \*\*Corrective Action Form\*\* for\?/);
  });
});
