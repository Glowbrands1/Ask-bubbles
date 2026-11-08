import { describe, expect, it } from "vitest";

import type { RosterEmployee } from "./employee-match";
import { copyOpenFormFor } from "./copy-open-form-for";

/** COPY_OPEN_FORM_FOR_PERSON_ENABLED (QA, 8 Nov 2026). Invented people. */
const person = (firstName: string, lastName: string): RosterEmployee => ({ id: `e-${firstName}`, firstName, lastName, locationIds: ["loc-264"] }) as RosterEmployee;
const ROSTER = [person("Orla", "Venning"), person("Cormac", "Teague"), person("Ines", "Marrow")];
const open = { openTemplateName: "Coaching Form", openEmployeeName: "Orla Venning", roster: ROSTER };

describe("copyOpenFormFor", () => {
  it.each([
    "copy this form for Cormac Teague",
    "copy this coaching form for cormac teague",
    "can you copy this form for Cormac Teague?",
  ])("%s → Cormac's request for the open template", (question) => {
    expect(copyOpenFormFor({ ...open, question })).toBe("create the same coaching form for Cormac Teague");
  });

  it.each([
    ["names nobody else", "copy this form"],
    ["names only the open form's person", "copy this form for Orla Venning"],
    ["names two people", "copy this form for Cormac Teague and Ines Marrow"],
    ["is not a copy request", "add that Cormac Teague saw it too"],
    ["is someone off the roster", "copy this form for Tamsin Oddway"],
    // QA's round-5 gate (8 Nov 2026): the person named is the form to copy FROM, onto the open draft (SAME_FORM_COPY_NEW_PERSON's turn).
    ["names the form to copy from", "can you create the same draft that we did with cormac teague by changing the name and position?"],
    ["names the form to copy from, first name", "copy the same coaching form from Cormac onto this one"],
  ])("a turn that %s: null", (_why, question) => {
    expect(copyOpenFormFor({ ...open, question })).toBeNull();
  });

  it("no open form: null", () => {
    expect(copyOpenFormFor({ ...open, openTemplateName: null, question: "copy this form for Cormac Teague" })).toBeNull();
  });
});
