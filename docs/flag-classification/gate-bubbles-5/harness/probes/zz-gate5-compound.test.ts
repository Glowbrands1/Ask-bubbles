import { appendFileSync } from "node:fs";

import { it } from "vitest";

import { addedFacts } from "./card-checked-against-words";

/* GATE-ONLY compound-sentence probe (Gate-Bubbles-5, 13 Nov 2026). Invented person. */
const ROSTER = [
  { id: "e-1", firstName: "Marnie", lastName: "Holloway", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
] as never;
const FIRST = "create a CA for Marnie Holloway, she was late on 11/3/26";
const SAID = [
  "she yelled at a customer and she gets a verbal warning",
  "she left the store dirty and she maybe forgot",
  "she yelled at a customer and gets a verbal warning",
  "she left the store dirty and might have forgotten",
  "she yelled at a customer and she is a key holder",
  "she left the store dirty and she works at West Dodge",
  "she left the store dirty and she had a verbal warning on 10/1",
  "she left the store dirty, she is a Team Member Part Time",
  "she yelled at a customer and then she walked out",
];
it("compound", () => {
  for (const later of SAID) {
    const got = addedFacts("she was late on 11/3/26", "Marnie Holloway", { turns: [FIRST, later], roster: ROSTER });
    appendFileSync(process.env.PROBE_OUT ?? "/dev/null", `${process.env.TAG} ${later} => ${JSON.stringify(got)}\n`);
  }
});
