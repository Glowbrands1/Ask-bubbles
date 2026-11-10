import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * The sibling app's gate finding (6 Nov 2026, sf-s28), checked here: "create a corrective action
 * for Marisol Quenby from bellevue, …" from a location manager whose only store is West Dodge filed
 * the card at West Dodge with no word about Bellevue, with CA_SALES on or off ("from" was no place
 * cue). PLACE_FROM_CUE_ENABLED reads "for <name> from <store>" as the store named. The person is
 * invented and not on the directory.
 */
const MARISOL: DirectoryRow = { id: "e-marisol-quenby-from", firstName: "Marisol", lastName: "Quenby", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

/** The invented person of this file (a function: the registry reads exported arrays as cases). */
export function placeFromCuePeople(): readonly DirectoryRow[] {
  return [MARISOL];
}

const OUT_OF_SCOPE = /\*\*Bellevue, NE\*\* isn['’]t a store on your assignment/;
const REPORT = "The sibling app's gate, 6 Nov 2026 (sf-s28), in this app: a store off the assignment named with \"from\" got no question";

export const NOV6_PLACE_FROM_CUE_CASES: ReplayCase[] = [
  {
    id: "nov6-place-from-cue-from-bellevue",
    title: "\"… for Marisol Quenby from bellevue, …\": Bellevue is not on the assignment, and nothing is filed there",
    report: REPORT,
    // Was open in production ("with production's flags the card takes West Dodge with no word about Bellevue"); holds since flip 6 (QA, 7 Nov 2026 20:50 PHT), so it is fixed.
    status: "fixed",
    fixFlags: ["PLACE_FROM_CUE_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-06T02:00:00Z"));
      t.directory([...STAFF, MARISOL]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("create a corrective action for Marisol Quenby from bellevue, she was rude to a guest at the register");
      expect(reply.content, `no word about Bellevue:\n${reply.content}`).toMatch(OUT_OF_SCOPE);
      expect([null, "loc-264"], `the card was filed outside the assignment:\n${reply.content}`).toContain(thread.proposal?.locationId ?? null);
    },
  },
  {
    id: "nov6-place-from-cue-transferred-negative",
    title: "negative: \"she transferred from bellevue last month\" is a past store: no out-of-assignment question, the card stays at her store",
    report: `${REPORT}, negative`,
    status: "fixed",
    fixFlags: ["PLACE_FROM_CUE_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-06T02:00:00Z"));
      t.directory([...STAFF, MARISOL]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("create a corrective action for Marisol Quenby, she transferred from bellevue last month, she was late opening the store on Monday");
      expect(reply.content, `asked about a past store:\n${reply.content}`).not.toMatch(/isn['’]t a store on your assignment/);
      expect(thread.proposal?.locationId ?? null, `the card's store:\n${reply.content}`).toBe("loc-264");
    },
  },
];
