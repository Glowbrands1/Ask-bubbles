import { afterEach, describe, expect, it, vi } from "vitest";

import { firstUnnegatedPerson, negatedPeople, negationCandidates, unnegatedNameReading, withoutNegatedPeople } from "./negated-person";

/** NEGATED_PERSON_NO_CARD_ENABLED (QA-6, 26 Oct 2026). Rowan Pell and Corvin Mallow are invented names. */
afterEach(() => {
  vi.unstubAllEnvs();
});

/*
 * STATE_CODE_NOT_A_PERSON_ENABLED (main, 26 Oct 2026): "did not clock" is not
 * a negated person. "Create a CA for … at Dodge, NE. She did not clock in"
 * must still create the card; the guard finds nobody negated in it and leaves
 * every turn as typed.
 */
describe("the state-code turns are not negations", () => {
  it.each([
    "Create a CA for Corvin Mallow at Dodge, NE. She did not clock in on 10/22.",
    "create a ca for corvin mallow at dodge, ne. she did not clock in on 10/22.",
    "CREATE A CA FOR CORVIN MALLOW AT DODGE, NE. SHE DID NOT CLOCK IN ON 10/22.",
    "Create a CA for Corvin Mallow at Lawrence, KS. She did not clock in on 10/22.",
  ])("flag on: %s", (text) => {
    vi.stubEnv("NEGATED_PERSON_NO_CARD_ENABLED", "true");
    const candidates = negationCandidates(text, "Corvin Mallow", ["Corvin Mallow", "Rowan Pell"]);
    expect(negatedPeople(text, candidates)).toEqual([]);
    expect(unnegatedNameReading("Corvin Mallow", [text], ["Corvin Mallow"])).toEqual({ proposed: "Corvin Mallow", turns: [text] });
  });
});

describe("negated-person helpers", () => {
  it("flag off: nothing is negated and the text is unchanged", () => {
    expect(negatedPeople("never one for Rowan Pell", ["Rowan Pell"])).toEqual([]);
    expect(firstUnnegatedPerson("one for Rowan Pell, not Corvin Mallow", ["Corvin Mallow", "Rowan Pell"])).toBeNull();
    expect(withoutNegatedPeople("never one for Rowan Pell", ["Rowan Pell"])).toBe("never one for Rowan Pell");
  });

  it("flag on: the negated person is found and blanked, the rest of the text keeps its place", () => {
    vi.stubEnv("NEGATED_PERSON_NO_CARD_ENABLED", "true");
    expect(negatedPeople("no, not for Rowan Pell, for Corvin Mallow", ["Rowan Pell", "Corvin Mallow", null])).toEqual(["Rowan Pell"]);
    expect(firstUnnegatedPerson("one for Rowan Pell, not Corvin Mallow", ["Corvin Mallow", "Rowan Pell"])).toBe("Rowan Pell");
    const masked = withoutNegatedPeople("no, not for Rowan Pell, for Corvin Mallow", ["Rowan Pell"]);
    expect(masked).toBe(`no, not for ${" ".repeat("Rowan Pell".length)}, for Corvin Mallow`);
  });
});
