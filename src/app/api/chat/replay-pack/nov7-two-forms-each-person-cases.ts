import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * The sibling app's live tester after its flip 7 (QA, 7 Nov 2026): "Coaching form for <A>. Also a CA for <B>." gave
 * one Coaching card with no employee there, and B's Corrective Action was not made. A GUARD here: this app makes one
 * card per request, each from what was said about its own person, so A's Coaching card and B's Corrective Action
 * card both come back, even with the models reading B for the whole message (the sibling app's live shape). The
 * people are invented.
 */
const person = (id: string, firstName: string, lastName: string): DirectoryRow => ({
  id,
  firstName,
  lastName,
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
});
const PEREGRINE = person("e-peregrine-ashcombe", "Peregrine", "Ashcombe");
const TAMSIN = person("e-tamsin-wexley", "Tamsin", "Wexley");

/** The invented people of this file (a function: the registry reads exported arrays as cases). */
export function twoFormsEachPersonPeople(): readonly DirectoryRow[] {
  return [PEREGRINE, TAMSIN];
}

export const NOV7_TWO_FORMS_EACH_PERSON_CASES: ReplayCase[] = [
  {
    id: "nov7-two-forms-each-person-coaching-and-ca",
    title: "guard: \"Coaching form for <A>. Also a CA for <B>.\": a Coaching card for A and a Corrective Action card for B",
    report: "QA, 7 Nov 2026 (the sibling app's live tester after its flip 7): one Coaching card with no employee, B's CA not made",
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-07T15:00:00Z"));
      t.directory([...STAFF, PEREGRINE, TAMSIN]);
      t.as("location_manager", WEST_DODGE);
      t.slotsRead({ employee: "Tamsin Wexley", formType: "Coaching Form", formTurn: true });
      const thread = t.thread();
      const reply = await thread.say("Coaching form for Peregrine Ashcombe. Also a CA for Tamsin Wexley.");
      const cards = ((reply as { formProposals?: { templateKey?: string; employeeName?: string | null }[] }).formProposals ?? []).map((card) => [card.templateKey, card.employeeName]);
      expect(cards, `not one card per person:\n${reply.content}`).toEqual(expect.arrayContaining([["coaching", "Peregrine Ashcombe"], ["dpoa", "Tamsin Wexley"]]));
    },
  },
];
