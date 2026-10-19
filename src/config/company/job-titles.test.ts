import { describe, expect, it } from "vitest";

import { COMPANY_JOB_TITLES } from "./job-titles";

const titleOf = (text: string) => COMPANY_JOB_TITLES.find((entry) => entry.pattern.test(text))?.title ?? null;

describe("job titles as managers type them survive the Salon -> Store wording", () => {
  it.each([
    ["salon director", "Store Director"],
    ["Store Director", "Store Director"],
    ["SD", "Store Director"],
    ["salon director in training", "SDIT"],
    ["store director in training", "SDIT"],
    ["SDIT", "SDIT"],
    ["training salon director", "TSD"],
    ["training store director", "TSD"],
    ["TSD", "TSD"],
    ["assistant salon director", "ASD"],
    ["assistant store director", "ASD"],
    ["ASD", "ASD"],
    ["district manager", "District Manager"],
    ["store manager", "Store Manager"],
    ["assistant store manager", "Assistant Manager"],
  ])("reads %s as %s", (typed, title) => {
    expect(titleOf(typed)).toBe(title);
  });

  it("still reads the Woven position names this deployment actually has", () => {
    // From woven_position_map / the employee directory. Titles come from Woven as-is; this file
    // only reads what a manager TYPES, so these results must not change with the wording.
    expect(titleOf("Team Member Full Time")).toBe("Team Member");
    expect(titleOf("Team Member Part Time")).toBe("Team Member");
    expect(titleOf("District Manager")).toBe("District Manager");
  });
});
