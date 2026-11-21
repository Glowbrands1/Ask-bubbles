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
    ["team member", "Team Member"],
  ])("%s is %s", (typed, title) => {
    expect(loopTitleIn(`our ${typed} Remy Calder was late on 11/18`)).toBe(title);
    expect(loopCardTitle(typed)).toBe(title);
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
