import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loopCardTitle, loopTitleIn } from "./job-titles";
import { titleSaidFor, withoutJobTitle } from "./tools";

/*
 * QA2 for Pau (21 Nov 2026, from this app's Woven data: employee_access_directory + woven_position_map): this company's
 * positions are Team Member Part Time / Full Time, Seasonal Team Member Part Time, Assistant General Manager, General
 * Manager, District Manager, Operator, Owner, Corporate, Maintenance Team, Marketing, Accounting, Human Resources
 * Generalist and Payroll Administrator. The loop reads those (and GM, AGM, DM, team member, store manager), and never
 * the sibling company's positions. This file names those on purpose, to show they are not read; it is left out of
 * `no-sibling-content.test.ts`'s scan. Invented names.
 */
const SIBLING_POSITIONS = ["SDIT", "TSD", "DMIT", "FTTC", "ASD", "tanning consultant", "Full-Time Tanning Consultant"];

describe("the loop reads only this company's job titles", () => {
  it.each(SIBLING_POSITIONS)("%s is not a title here", (position) => {
    expect(loopTitleIn(`our ${position} Remy Calder was late on 11/18`)).toBeNull();
    expect(loopCardTitle(position)).toBeNull();
    expect(withoutJobTitle(`${position} Remy Calder`)).toBe(`${position} Remy Calder`);
    expect(titleSaidFor(`your ${position} Remy Calder was late`, "Remy Calder", [])).toBeNull();
  });

  it.each([
    ["AGM", "Assistant General Manager"],
    ["agm", "Assistant General Manager"],
    ["Assistant General Manager", "Assistant General Manager"],
    ["General Manager", "General Manager"],
    ["GM", "General Manager"],
    ["store manager", "General Manager"],
    ["DM", "District Manager"],
    ["team member part time", "Team Member Part Time"],
    ["Seasonal Team Member Part Time", "Seasonal Team Member Part Time"],
  ])("%s is %s", (typed, title) => {
    expect(loopTitleIn(`our ${typed} Remy Calder was late on 11/18`)).toBe(title);
    expect(loopCardTitle(typed)).toBe(title);
  });

  /*
   * Pau via QA2 (21 Nov 2026): "team member", "staff" and "employee" are the same frontline role. "My staff", "an
   * employee", "a team member" are fine, and never a title of their own (so never title_differs against Woven's Team
   * Member Part Time) nor someone's Position, nor part of a person's name.
   */
  it.each(["team member", "Team Member", "staff", "staff member", "employee", "Employee"])("%s is the frontline role: never a title, never part of a name", (word) => {
    expect(loopTitleIn(`my ${word} Remy Calder was late on 11/18`)).toBeNull();
    expect(loopCardTitle(word)).toBeNull();
    expect(titleSaidFor(`a ${word}, Remy Calder, was late`, "Remy Calder", [])).toBeNull();
    expect(withoutJobTitle(`${word} Remy Calder`)).toBe("Remy Calder");
    expect(withoutJobTitle(`Remy Calder, ${word}`)).toBe("Remy Calder");
  });

  it("a title typed beside the name is taken off it, and is the title said for that person", () => {
    expect(withoutJobTitle("AGM Remy Calder")).toBe("Remy Calder");
    expect(withoutJobTitle("Remy Calder, General Manager")).toBe("Remy Calder");
    expect(titleSaidFor("your AGM Remy Calder was late", "Remy Calder", [])).toBe("Assistant General Manager");
  });

  it("a state after a comma is a place, not a title", () => {
    expect(loopTitleIn("Remy Calder at Sioux Falls, SD")).toBeNull();
  });
});
