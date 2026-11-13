import { describe, expect, it } from "vitest";

import type { RosterEmployee } from "./employee-match";
import { sameNameChoice, sameNameQuestion, type SameNameCandidate } from "./same-name-choice";

/**
 * SAME_NAME_ASKS_WHICH_ENABLED (QA, 12 Nov 2026). Two active people with one name at ONE store were asked "Which store
 * is the one you mean?", which cannot tell them apart. The numbered choice is labelled with store and job title, and
 * the answer selects a roster candidate by store AND title, never by name. People are synthetic.
 */

const label = (id: string) => (id === "loc-264" ? "Omaha, NE (West Dodge Rd) (Store 264)" : "Lincoln, NE (Store 67)");
const person = (id: string, locationIds: string[], positionName: string): SameNameCandidate => ({
  name: "Marnie Holloway",
  employee: { id, firstName: "Marnie", lastName: "Holloway", locationIds, positionName } as RosterEmployee,
});
const ONE_STORE = [person("e-1", ["loc-264"], "Team Member Part Time"), person("e-90", ["loc-264"], "Assistant General Manager")];
const TWO_STORES = [person("e-1", ["loc-264"], "Team Member Part Time"), person("e-91", ["loc-67"], "Team Member Part Time")];

const answer = (candidates: SameNameCandidate[], reply: string) => {
  const asked = sameNameQuestion("marnie holloway", candidates, label);
  const chosen = sameNameChoice(
    [{ role: "user", content: "verbal CA for marnie holloway, she was late on 11/1/26" }, { role: "assistant", content: asked }, { role: "user", content: reply }],
    candidates,
    label,
  );
  return chosen === null || chosen === "keep" ? chosen : chosen.employee.id;
};

describe("two people with one name: a numbered choice, answered by identity", () => {
  it("the question numbers each person with store and job title, and never asks which store", () => {
    const asked = sameNameQuestion("marnie holloway", ONE_STORE, label);
    expect(asked).toContain("1. **Marnie Holloway** (Omaha, NE (West Dodge Rd) (Store 264), Team Member Part Time)");
    expect(asked).toContain("2. **Marnie Holloway** (Omaha, NE (West Dodge Rd) (Store 264), Assistant General Manager)");
    expect(asked).not.toMatch(/Which store/);
  });

  it("one store: the number and the job title select that person", () => {
    expect(answer(ONE_STORE, "2")).toBe("e-90");
    expect(answer(ONE_STORE, "1")).toBe("e-1");
    expect(answer(ONE_STORE, "the assistant general manager")).toBe("e-90");
    expect(answer(ONE_STORE, "team member part time")).toBe("e-1");
  });

  it("one store: the store both share selects nobody", () => {
    expect(answer(ONE_STORE, "west dodge")).toBeNull();
  });

  it("two stores: the store selects that person", () => {
    expect(answer(TWO_STORES, "lincoln")).toBe("e-91");
    expect(answer(TWO_STORES, "the west dodge one")).toBe("e-1");
  });

  it("the answer is read among the saved form state's lines, before or after it", () => {
    expect(answer(ONE_STORE, "The employee is marnie holloway.\n2")).toBe("e-90");
    expect(answer(ONE_STORE, "the assistant general manager\nWarning level: verbal.")).toBe("e-90");
  });

  it("\"keep\" keeps the typed name, and an answer naming a person not in the candidates selects nobody", () => {
    expect(answer(ONE_STORE, "keep marnie holloway")).toBe("keep");
    expect(answer([ONE_STORE[0]!], "2")).toBeNull();
  });
});
