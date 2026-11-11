import { expect } from "vitest";

import { STAFF, type ReplayCase } from "./cases";

/**
 * The sibling app's replay set s21, in this app's words (3 Nov 2026; invented
 * people): the manager names the employee's PRIMARY store, then the store the
 * incident happened at. The sibling app's card took the primary store and is fixed
 * there behind PRIMARY_SALON_NOT_EDIT_ENABLED. This app has no reading of
 * "store is X" as a store edit, so no flag is ported (Pau, 3 Nov 2026, master
 * plan v4, option b); this case pins that the card never takes the primary
 * store here.
 */
const KEARNEY = "loc-66";
const WEST_DODGE = "loc-264";

export const NOV3_PRIMARY_STORE_CASES: readonly ReplayCase[] = [
  {
    id: "nov3-s21-primary-store-not-card-store",
    title: "\"primary store is X … working a shift at Y\": the card never takes X",
    report:
      "The sibling app's replay set s21, this app's words: \"Put together a written CA for <name>, primary store is <store X>. But on Monday 10/05/2026 <name> was working a shift at <store Y> and did not complete …\"",
    status: "fixed",
    async run(t) {
      t.directory([
        ...STAFF,
        { id: "e-s21", firstName: "Tamsin", lastName: "Orlebar", preferredFirstName: null, employmentStatus: "active", locationIds: [KEARNEY, WEST_DODGE], positionName: "Team Member Part Time" },
      ]);
      t.as("location_manager", { level: "location", primaryAreaId: KEARNEY, alsoCoversAreaIds: [WEST_DODGE] });
      const thread = t.thread();
      const reply = await thread.say(
        "Put together a written CA for Tamsin Orlebar, primary store is Kearney. But on Monday 10/05/2026 Tamsin was working a shift at West Dodge Rd and did not complete the closing checklist",
      );
      expect(reply.formProposal?.locationId ?? null, "the card's store").not.toBe(KEARNEY);
    },
  },
];
