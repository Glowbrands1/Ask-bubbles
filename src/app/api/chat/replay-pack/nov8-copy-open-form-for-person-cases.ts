import { expect, vi } from "vitest";

import { STAFF, TWO_STORES, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * "COPY THIS FORM FOR <B>" WITH <A>'S FORM OPEN MAKES <B>'S CARD (QA, 8 Nov 2026)
 * ============================================================================
 *
 * Checked on main for the sibling app's round-4 item (3): with <A>'s Coaching Form open, "copy this form for <B>"
 * made no card. The reply was "A grounded answer from the policy manual." and the card stayed A's.
 * COPY_OPEN_FORM_FOR_PERSON_ENABLED reads it as B's request for the open template. Invented people: A works at
 * loc-264 only, B at loc-67 only, and the manager covers both.
 */
const at = (id: string, firstName: string, lastName: string, store: string, positionName: string): DirectoryRow => ({
  id,
  firstName,
  lastName,
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: [store],
  positionName,
});
const ORLA = at("e-orla-venning", "Orla", "Venning", "loc-264", "Team Member Part Time");
const CORMAC = at("e-cormac-teague", "Cormac", "Teague", "loc-67", "Assistant General Manager");

/** The invented people of this file (a function: the registry reads exported arrays as cases). */
export function copyOpenFormForPeople(): readonly DirectoryRow[] {
  return [ORLA, CORMAC];
}

async function orlaForm(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-07T02:00:00Z"));
  t.directory([...STAFF, ORLA, CORMAC]);
  t.as("location_manager", TWO_STORES);
  const thread = t.thread();
  await thread.say("create a coaching form for Orla Venning, she left the soap molds unwashed at close");
  expect(thread.proposal, "no Coaching card for Orla Venning").toMatchObject({ templateKey: "coaching", employeeName: "Orla Venning" });
  t.draftWrites({ coaching_details: "Observed: Orla Venning left the soap molds unwashed at close." });
  const orla = await thread.create();
  expect(t.values(orla).coaching_details ?? "", "Orla's Details were not written").toMatch(/soap molds/);
  return { thread, orla };
}

export const NOV8_COPY_OPEN_FORM_FOR_PERSON_CASES: ReplayCase[] = [
  {
    id: "nov8-copy-open-form-for-person",
    title: "\"copy this form for <B>\" with <A>'s Coaching Form open: B's own card, and Create copies A's form",
    report: "QA, 8 Nov 2026: no card for B, \"A grounded answer from the policy manual.\" (found checking the sibling app's round-4 item 3)",
    status: { open: "no card for B: the answering model replies and the card stays A's" },
    fixFlags: ["COPY_OPEN_FORM_FOR_PERSON_ENABLED"],
    async run(t) {
      const { thread, orla } = await orlaForm(t);
      const before = JSON.stringify(t.values(orla));
      const reply = await thread.say("copy this form for Cormac Teague");
      expect(thread.proposal, `no Coaching card for Cormac Teague:\n${reply.content}`).toMatchObject({ templateKey: "coaching", employeeName: "Cormac Teague" });
      expect(thread.proposal?.locationId, "Cormac's card is not at his own store").toBe("loc-67");
      const cormac = await thread.create();
      expect(cormac).not.toBe(orla);
      expect(t.values(cormac).coaching_details ?? "", "Orla's Details were not copied").toMatch(/soap molds/);
      expect(t.values(cormac).coaching_details ?? "", "the copy still names Orla").not.toMatch(/orla|venning/i);
      expect(JSON.stringify(t.values(orla)), "Orla's own form changed").toBe(before);
    },
  },
  {
    id: "nov8-copy-open-form-for-person-edit-stays-on-open-form",
    title: "with <A>'s form open, \"add that she was reminded twice\" is still an edit of A's form, never a new card",
    report: "QA, 8 Nov 2026: COPY_OPEN_FORM_FOR_PERSON's guard (a turn that names nobody else)",
    status: "fixed",
    fixFlags: ["COPY_OPEN_FORM_FOR_PERSON_ENABLED"],
    async run(t) {
      const { thread } = await orlaForm(t);
      const reply = await thread.say("add that she was reminded twice");
      expect(reply.formProposal?.employeeName ?? null, `a new card from an edit:\n${reply.content}`).not.toBe("Cormac Teague");
    },
  },
];
