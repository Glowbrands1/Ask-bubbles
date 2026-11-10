import { afterEach, describe, expect, it, vi } from "vitest";

import { draftFacts, missingFacts } from "./draft-consistency";
import { lateOpeningWords } from "./late-open";

/** QA's live Bubbles round 17b (10 Nov 2026): the card's quote and the draft's name note. People invented. */
afterEach(() => vi.unstubAllEnvs());

describe("lateOpeningWords: the manager's own words for a late opening", () => {
  it.each([
    ["Can you make a CA for Corisande Pell for failure to open on time?", "failure to open on time"],
    ["Can you make a CA for Corisande Pell, she did not show up for a scheduled opening shift", "scheduled opening shift"],
    ["she was late to open the store", "late to open the store"],
    ["Opened the store late on 10/2", "Opened the store late"],
  ])("%s → %s", (said, words) => {
    vi.stubEnv("FAILURE_TO_OPEN_IS_LATE_OPENING_ENABLED", "true");
    expect(lateOpeningWords(said)).toBe(words);
    expect(said).toContain(lateOpeningWords(said)!);
  });

  it("nothing about opening: null", () => {
    expect(lateOpeningWords("she was rude to a guest")).toBeNull();
  });
});

describe("FIRST_NAME_ENOUGH_ENABLED: a first name in Details is the name", () => {
  const facts = () => draftFacts({ employeeName: "Ottoline Ormsworth", notes: "create a coaching form for Ottoline Ormsworth, she missed the monthly meeting on 11/9/26", today: "2026-11-10" });
  const values = { coaching_details: "Observed:\nOttoline missed the monthly meeting on 11/9/26." };

  it("on: the surname is not reported missing", () => {
    vi.stubEnv("FIRST_NAME_ENOUGH_ENABLED", "true");
    expect(missingFacts(values, ["coaching_details"], facts()).map((fact) => fact.shown)).toEqual([]);
  });

  it("on: a Details that names nobody still reports the name", () => {
    vi.stubEnv("FIRST_NAME_ENOUGH_ENABLED", "true");
    const missing = missingFacts({ coaching_details: "Observed:\nThe employee missed the monthly meeting on 11/9/26." }, ["coaching_details"], facts());
    expect(missing.map((fact) => fact.shown)).toEqual(["Ottoline", "Ormsworth"]);
  });

  it("off: as before, the surname is reported", () => {
    vi.stubEnv("FIRST_NAME_ENOUGH_ENABLED", "false");
    expect(missingFacts(values, ["coaching_details"], facts()).map((fact) => fact.shown)).toEqual(["Ormsworth"]);
  });
});

describe("FIRST_NAME_ENOUGH_ENABLED is the Coaching Form's Details only", () => {
  it("on: a Corrective Action's Observation still reports the dropped surname (\"Marnie was late\")", () => {
    vi.stubEnv("FIRST_NAME_ENOUGH_ENABLED", "true");
    const facts = draftFacts({ employeeName: "Marnie Quill", notes: "Create a Corrective Action for Marnie Quill, she was late to open on 10-20-26", today: "2026-11-10" });
    const missing = missingFacts({ observed_expectation: "Marnie was late to open on 10-20-26." }, ["observed_expectation"], facts);
    expect(missing.map((fact) => fact.shown)).toEqual(["Quill"]);
  });
});
