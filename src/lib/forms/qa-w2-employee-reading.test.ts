import { describe, expect, it } from "vitest";

import { displayPersonName, employeeState, extractEmployeeNames, managerContext } from "./proposal";

/**
 * QA, 22 Oct 2026 — who the form is for, read from the manager's own turns.
 *
 *   F-02  a reply that is only a store ("kearney", "sorry, it's grand island")
 *         replaced the employee already named
 *   F-09  a role between "for" and the name ("for the manager Jane Doe", "for
 *         her coworker Amy Lee") hid the person; "Her coworker Amy Lee" at the
 *         start of a sentence was read as a second subject
 *   F-06  "both" / "either", answering "which of them?", became the employee
 *   spelling  the manager's spelling is kept (exact directory matches are
 *         applied in `form-proposal.ts`, not here)
 *
 * Buff City Soap stores only. Every person is synthetic.
 */

/** The employee after the manager's turns, read the way the proposal reads them. */
function after(...turns: string[]) {
  const history = turns.slice(0, -1).map((content, index) => ({ id: `u${index}`, role: "user" as const, content }));
  return employeeState(managerContext(history, { id: "now", content: turns[turns.length - 1]! })).resolution;
}

const OPENED = "create a coaching form for pat rivera, late 3 times this week";

describe("F-02: a reply that names a store never replaces the employee", () => {
  it.each([
    "kearney",
    "Kearney",
    "KEARNEY",
    "Kearney, NE",
    "grand island",
    "sorry, it's grand island",
    "it's at kearney",
    "at kearney",
    "omaha",
    "lee's summit",
    "sioux falls",
    "bellevue",
    "west dodge",
  ])("%s", (reply) => {
    expect(after(OPENED, reply)).toEqual({ kind: "resolved", employeeName: "pat rivera" });
  });

  it("several store replies in a row still leave the employee alone", () => {
    expect(after(OPENED, "kearney", "sorry, grand island", "omaha")).toEqual({ kind: "resolved", employeeName: "pat rivera" });
  });

  it("with no employee yet, a store reply does not become one", () => {
    expect(after("i need a coaching form", "kearney")).toEqual({ kind: "missing" });
    expect(after("i need a coaching form", "sorry, it's grand island")).toEqual({ kind: "missing" });
  });

  describe("an explicit change of person still changes it", () => {
    it.each([
      ["actually it's for sam jones", "sam jones"],
      ["the employee is Pat Kearney", "Pat Kearney"],
      ["not pat rivera, it's dana moss", "dana moss"],
      ["No, not Pat. Dana Moss.", "Dana Moss"],
      ["it's for dana moss", "dana moss"],
    ])("%s", (reply, employee) => {
      expect(after(OPENED, reply)).toEqual({ kind: "resolved", employeeName: employee });
    });
  });

  it("a word that is not one of this company's stores is still a name", () => {
    // No Buff City Soap store is called Lawrence; the roster, not a list of towns, decides.
    expect(after("i need a coaching form", "lawrence")).toEqual({ kind: "resolved", employeeName: "lawrence" });
    expect(extractEmployeeNames("coaching form for Pat Kearney")).toEqual(["Pat Kearney"]);
  });
});

describe("spelling: the manager's own", () => {
  it.each([
    ["coaching form for jane doe", "jane doe"],
    ["COACHING FORM FOR JANE DOE", "JANE DOE"],
    ["coaching form for Jane McDonald", "Jane McDonald"],
  ])("%s", (text, employee) => {
    expect(after(text)).toEqual({ kind: "resolved", employeeName: employee });
  });

  it("only the spacing is tidied", () => {
    expect(displayPersonName("  jane   doe ")).toBe("jane doe");
    expect(displayPersonName("JOHN SMITH III")).toBe("JOHN SMITH III");
    expect(displayPersonName("de la cruz")).toBe("de la cruz");
  });
});
