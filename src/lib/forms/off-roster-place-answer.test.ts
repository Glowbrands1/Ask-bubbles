import { afterEach, describe, expect, it, vi } from "vitest";

import { offRosterOffer } from "./off-roster-confirm";
import { offRosterQuestion } from "./off-roster-ask";
import { placeAnswerOf, placeOnly, withPlaceAnswer } from "./off-roster-place-answer";

/** Port from the sibling app (37b live bug, 12 Nov 2026): a place to the open "use <C>" offer became the employee. <C> is invented. */
const C = "Brisa Talmadge";
const history = [
  { role: "user", content: `CA for ${C}, do not terminate yet, she was late` },
  { role: "assistant", content: `I couldn't find **${C}** in the Woven roster, so that name is not on the form. ${offRosterOffer(C)}` },
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("placeOnly", () => {
  it.each(["Omaha, NE (West Dodge Rd)", "Bellevue", "NE Omaha", "Des Moines, IA", "omaha, ne", "at Omaha, NE"])("%s is a place", (said) => {
    expect(placeOnly(said)).not.toBeNull();
  });

  it.each(["use Brisa Talmadge", "yes", "Brisa Talmadge", "in Omaha she was late", "me too", "ok", "she was late"])("%s is not a place", (said) => {
    expect(placeOnly(said)).toBeNull();
  });

  it("a roster store is read as that store", () => {
    expect(placeOnly("Omaha, NE (West Dodge Rd)")).toEqual({ storeId: "loc-264" });
    expect(placeOnly("Des Moines, IA")).toEqual({ storeId: null });
  });
});

describe("OFF_ROSTER_PLACE_ANSWER_ENABLED", () => {
  it("off: no place answer", () => {
    expect(placeAnswerOf("Des Moines, IA", history)).toBeNull();
  });

  it("on: a place to the open offer; no offer, no place answer", () => {
    vi.stubEnv("OFF_ROSTER_PLACE_ANSWER_ENABLED", "true");
    expect(placeAnswerOf("Des Moines, IA", history)).toEqual({ pending: C, place: "Des Moines, IA", storeId: null });
    expect(placeAnswerOf("Des Moines, IA", history.slice(0, 1))).toBeNull();
  });

  it("the card holds no employee, takes an allowed store, and asks the offer again over the account", () => {
    const card = { employeeName: C, status: "ready", supportsInlineDraft: true, locationId: null, locationName: null };
    const answer = { content: `I'll draft a **Corrective Action Form** for **${C}** from what you've described.\n\n**Observation of Offense:** do not terminate yet, she was late`, formProposal: card };
    const admin = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as never;
    const set = withPlaceAnswer(answer, { pending: C, place: "Bellevue", storeId: "loc-67" }, admin);
    expect(set.formProposal).toMatchObject({ employeeName: null, status: "needs_employee", supportsInlineDraft: false });
    expect(set.content).toContain(offRosterQuestion(C));
    expect(set.content).toContain(offRosterOffer(C));
    expect(set.content).toContain("**Observation of Offense:** do not terminate yet, she was late");
    expect(set.content).not.toContain("I'll draft");
    const westDodge = { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] } as never;
    const notAllowed = withPlaceAnswer(answer, { pending: C, place: "Bellevue", storeId: "loc-67" }, westDodge);
    expect(notAllowed.formProposal?.locationId ?? null).toBeNull();
    expect(notAllowed.content).toMatch(/I read \*\*Bellevue\*\* as the store/);
  });
});
