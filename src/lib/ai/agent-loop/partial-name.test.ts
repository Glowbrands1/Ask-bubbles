import { describe, expect, it } from "vitest";

import { namedWholly, rosterMatches } from "./tools";

/**
 * Ported from the sibling app's board f110 (QA handoff, 22 Nov 2026): partial names still matched staff on the card side
 * ("<First> <start of last name>" seated that person with no question). rosterMatches still finds the people a partial
 * name could be (for the Did-you-mean); namedWholly says whether the words name them whole. Invented names.
 */
const AVALIND = { id: "e-4", firstName: "Avalind", lastName: "Haskett", preferredFirstName: null, locationIds: ["loc-264"] } as unknown as Parameters<typeof namedWholly>[1];
const AV = { id: "e-9", firstName: "Av", lastName: "Haskette", preferredFirstName: "Avie", locationIds: ["loc-264"] } as unknown as Parameters<typeof namedWholly>[1];

describe("namedWholly (f110)", () => {
  it.each(["Avalind", "avalind haskett", "Haskett", "AVALIND  HASKETT"])("%s names Avalind Haskett whole", (typed) => {
    expect(namedWholly(typed, AVALIND)).toBe(true);
  });
  it.each(["Avalind Hask", "Ava Hask", "Ava", "Hask", "Avalind Hasketts"])("%s only starts (or is not) a name: not whole", (typed) => {
    expect(namedWholly(typed, AVALIND)).toBe(false);
  });
  it("a preferred first name counts whole", () => {
    expect(namedWholly("Avie Haskette", AV)).toBe(true);
  });
  it("rosterMatches still finds the partial name's person, for the question", () => {
    expect(rosterMatches("Avalind Hask", [AVALIND]).map((row) => row.id)).toEqual(["e-4"]);
  });
});
