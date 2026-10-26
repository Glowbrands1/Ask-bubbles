import { afterEach, describe, expect, it, vi } from "vitest";

import { firstUnnegatedPerson, negatedPeople, withoutNegatedPeople } from "./negated-person";

/** NEGATED_PERSON_NO_CARD_ENABLED (QA-6, 26 Oct 2026). Rowan Pell and Corvin Mallow are invented names. */
afterEach(() => {
  vi.unstubAllEnvs();
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
