import { describe, expect, it } from "vitest";

import { COMPANY_JOB_TITLES, isJobTitleAbbreviation } from "./job-titles";

const titleOf = (text: string) => COMPANY_JOB_TITLES.find((entry) => entry.pattern.test(text))?.title ?? null;

describe("job titles as managers type them survive the Salon -> Store wording", () => {
  it.each([
    ["salon director", "Store Director"],
    ["Store Director", "Store Director"],
    ["SD", "Store Director"],
    ["salon director in training", "SDIT"],
    ["store director in training", "SDIT"],
    ["SDIT", "SDIT"],
    // CHANGED ON PURPOSE (Pau, 23 Nov: BCS terms in the forms): TSD and ASD are no longer titles here; Buff City Soap's are below.
    ["general manager", "General Manager"],
    ["GM", "General Manager"],
    ["assistant general manager", "Assistant General Manager"],
    ["AGM", "Assistant General Manager"],
    ["district manager", "District Manager"],
    ["store manager", "Store Manager"],
    ["assistant store manager", "Assistant Manager"],
  ])("reads %s as %s", (typed, title) => {
    expect(titleOf(typed)).toBe(title);
  });

  it("no longer reads the reference platform's TSD or ASD (Pau, 23 Nov 2026)", () => {
    expect(titleOf("TSD")).toBeNull();
    expect(titleOf("ASD")).toBeNull();
  });

  it("still reads the Woven position names this deployment actually has", () => {
    // From woven_position_map / the employee directory. Titles come from Woven as-is; this file
    // only reads what a manager TYPES, so these results must not change with the wording.
    expect(titleOf("Team Member Full Time")).toBe("Team Member");
    expect(titleOf("Team Member Part Time")).toBe("Team Member");
    expect(titleOf("District Manager")).toBe("District Manager");
  });
});

describe("a job-title abbreviation, as a name-role-store line uses one", () => {
  // "ASD" left (Pau, 23 Nov 2026); "AGM" and "GM" are Buff City Soap's.
  it.each(["ASM", "SD", "AGM", "GM", "DM", "RM", "asm"])("%s is one", (word) => {
    expect(isJobTitleAbbreviation(word)).toBe(true);
  });

  it.each(["NE", "OT", "PTO", "Grand", "manager", "store manager", "A", "TC", "TCs", "tc", "TSD", "ASD"])("%s is not", (word) => {
    expect(isJobTitleAbbreviation(word)).toBe(false);
  });
});

describe("\"TC\" / \"Tanning Consultant\" is not a Buff City Soap title", () => {
  it.each(["TC", "tc", "TCs", "tanning consultant", "Tanning Consultants"])("%s reads as no title", (typed) => {
    expect(titleOf(typed)).toBeNull();
  });

  it("no entry prints it", () => {
    expect(COMPANY_JOB_TITLES.map((entry) => entry.title)).not.toContain("Tanning Consultant");
  });
});
