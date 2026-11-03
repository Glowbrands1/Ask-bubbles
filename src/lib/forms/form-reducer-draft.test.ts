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

describe("writeInsOf (the Other box and its write-in, from the template's layout)", () => {
  async function versionOf(document: unknown): Promise<LoadedInstance> {
    return { instance: { variantKey: null }, version: { document }, values: [] } as unknown as LoadedInstance;
  }

  it("the Coaching Form's Other topic is the write-in of the Topic group's Other box", async () => {
    const { coachingDocument } = await import("./library");
    const { writeInsOf } = await import("./form-reducer-draft");
    expect(Object.fromEntries(writeInsOf(await versionOf(coachingDocument())))).toEqual({ other_topic: { group: "coaching_topics", option: "other" } });
  });

  it("no box labelled like the line, no write-in: the Corrective Action Form's Type of Offense has no Other box", async () => {
    const { correctiveActionDocument } = await import("./library");
    const { writeInsOf } = await import("./form-reducer-draft");
    expect(writeInsOf(await versionOf(correctiveActionDocument())).size).toBe(0);
  });
});
