import { describe, expect, it } from "vitest";

import { appendFileSync } from "node:fs";

import { addedFacts } from "./card-checked-against-words";

/* GATE-ONLY probe (Gate-Bubbles-5, QA's check (b), 13 Nov 2026; not part of any PR). Invented person. */
const ROSTER = [
  { id: "e-1", firstName: "Marnie", lastName: "Holloway", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
] as never;
const FIRST = "create a CA for Marnie Holloway, she was late on 11/3/26";
const ISSUE = "she was late on 11/3/26";
const probe = (later: string) => addedFacts(ISSUE, "Marnie Holloway", { turns: [FIRST, later], roster: ROSTER });

describe("QA (b): nothing wrong joins What happened", () => {
  const cases: [string, string][] = [
    ["level", "verbal warning"],
    ["level, sentence", "she gets a verbal warning"],
    ["level, written", "Written warning."],
    ["question", "she also left early, should I add that?"],
    ["question mid-turn", "should I add that she left early? she also left early"],
    ["key holder", "she's a key holder"],
    ["key holder, lower", "she is a key holder"],
    ["store", "she works at West Dodge"],
    ["store, roster label", "she is at Omaha, NE (West Dodge Rd)"],
    ["maybe", "maybe she was sick"],
    ["maybe, she-led", "she maybe forgot"],
    ["repeat", "she was late on 11/3/26"],
    ["repeat with also", "she was also late on 11/3/26"],
    ["hedge", "she should not be terminated yet"],
    ["title", "she is a Team Member Part Time"],
  ];
  for (const [label, later] of cases) {
    it(`${label}: "${later}"`, () => {
      const got = probe(later);
      appendFileSync(process.env.PROBE_OUT ?? "/dev/null", `PROBE ${label} | ${later} => ${JSON.stringify(got)}` + "\n");
      expect(true).toBe(true);
    });
  }
  it("control: a real added fact joins", () => {
    const got = probe("she also didn't call to say she'd be late");
    appendFileSync(process.env.PROBE_OUT ?? "/dev/null", `PROBE control | => ${JSON.stringify(got)}` + "\n");
  });
});
