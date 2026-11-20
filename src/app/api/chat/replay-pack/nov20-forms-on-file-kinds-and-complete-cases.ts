import { expect, vi } from "vitest";

import { WEST_DODGE, STAFF, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * "HOW MANY COACHINGS DID WE DO THIS MONTH?" NEVER COUNTS A FOLLOW-UP COACHING FORM (port from the sibling app's #1133)
 * ============================================================================
 *
 * QA's code audit on the sibling app (item 28): the Coaching kind reads template names with ilike "%coaching%", so the
 * Follow-Up Coaching Form was listed as a coaching. This app's Forms Register reader (`forms/chat-form-records.ts`) is
 * the same mechanism, read by the chat and the Leadership Assistant. The cut-off half (item 29) is unit-tested in
 * `src/lib/forms/form-kinds-and-complete.test.ts`: the replay harness's actor sees every row, so no visibility filter
 * runs here.
 *
 * WHAT THIS REPLAY SHOWS, AND DOES NOT: the forms are put on file directly (the harness's form rows): three November
 * coachings and two November follow-up coachings at the manager's store. The invariant is on the FORMS ON FILE block
 * the answering model was given, not on its scripted words.
 */

const QUESTION = "how many coachings did we do this month?";
const REPORT = "QA's code audit on the sibling app's main 9e1d1f67, item 28 (ported): a Follow-Up Coaching Form counted as a coaching";

function onFile(t: ReplayContext): void {
  const forms = t.forms() as Record<string, unknown>[];
  const put = (index: number, fields: Record<string, unknown>) =>
    forms.push({
      id: `nov20-kinds-${index}`,
      template_id: "t",
      template_version_id: "v",
      variant_key: null,
      employee_role: null,
      location_id: WEST_DODGE.primaryAreaId,
      location_name: "Omaha, West Dodge Rd",
      created_by: "another-manager",
      created_by_role: "location_manager",
      source: "assistant",
      status: "finalized",
      follow_up_date: null,
      archived_at: null,
      revises_instance_id: null,
      form_date: "2026-11-10",
      created_at: `2026-11-10T15:00:${String(index).padStart(2, "0")}Z`,
      updated_at: "2026-11-10T15:00:00Z",
      ...fields,
    });
  for (const [index, name] of ["Marlo Pennick", "Bexley Rourke", "Sunniva Tarrant"].entries()) {
    put(index, { template_key: "coaching", template_name: "Coaching Form", employee_name: name });
  }
  for (const [index, name] of ["Tamsin Okafor", "Quill Abernathy"].entries()) {
    put(10 + index, { template_key: "follow_up_coaching", template_name: "Follow-Up Coaching Form", employee_name: name });
  }
}

export const NOV20_FORMS_ON_FILE_KINDS_AND_COMPLETE_CASES: ReplayCase[] = [
  {
    id: "nov20-forms-on-file-coaching-not-follow-up",
    title: `"${QUESTION}" with 3 coachings and 2 follow-up coachings: the model is given the 3 coachings, never the follow-ups`,
    report: REPORT,
    // Not behind a flag: the reader drops the follow-ups whenever the question's kind is Coaching.
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-18T18:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      onFile(t);
      t.modelSays("Here are this month's coachings.");
      await t.thread().say(QUESTION);
      const system = t.lastFormRecords?.() ?? "";
      for (const name of ["Marlo Pennick", "Bexley Rourke", "Sunniva Tarrant"]) expect(system, `${name}'s coaching was not given to the model`).toContain(`${name};`);
      expect(system, "a Follow-Up Coaching Form was given as a coaching").not.toContain("Tamsin Okafor");
      expect(system).not.toContain("Quill Abernathy");
      expect(system).toContain("(3)");
    },
  },
];
