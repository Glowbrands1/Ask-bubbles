import { describe, expect, it } from "vitest";

import { restatesHeader } from "./form-reducer-draft";
import type { LoadedInstance } from "./instances";

/** Only what `restatesHeader` reads: the instance's columns and its header rows. */
function form(role: string, location: string, name = "Odile Farrant"): LoadedInstance {
  return {
    instance: { employeeRole: role, locationName: location, employeeName: name },
    values: [
      { fieldKey: "job_title", value: role, checked: [], filledBy: "system", provenance: {} },
      { fieldKey: "location", value: location, checked: [], filledBy: "system", provenance: {} },
    ],
  } as unknown as LoadedInstance;
}

describe("restatesHeader (Step B draft write: the position and store are not a topic)", () => {
  const odile = form("Team Member Part Time", "Omaha, NE (West Dodge Rd)");

  it("the position with the store, as written live, restates the header", () => {
    expect(restatesHeader("Team Member at Omaha", odile)).toBe(true);
    expect(restatesHeader("Team Member Part Time - West Dodge Rd", odile)).toBe(true);
    expect(restatesHeader("team member part time", odile)).toBe(true);
  });

  it("a real topic is kept, even one sharing a word with the position or the store", () => {
    expect(restatesHeader("Part time scheduling", odile)).toBe(false);
    expect(restatesHeader("Ship from store order flow", odile)).toBe(false);
    expect(restatesHeader("sanitizing checklist every shift", odile)).toBe(false);
  });

  it("no position on the form: nothing is read as one", () => {
    expect(restatesHeader("Team Member at Omaha", form("", "Omaha, NE (West Dodge Rd)"))).toBe(false);
  });
});
