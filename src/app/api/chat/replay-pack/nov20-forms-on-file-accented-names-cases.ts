import { expect, vi } from "vitest";

import { WEST_DODGE, STAFF, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * AN ACCENTED NAME IS ONE NAME (port from the sibling app's #1141, QA's code audit item 13)
 * ============================================================================
 *
 * "Ramírez" was read as two words, "ram" and "rez", so a manager who typed the accent was told no form names the person
 * whose coaching is on file as "Lucia Ramirez". One fold (`foldName`) now backs every name comparison: the roster's name
 * check, `samePerson` and the forms-on-file lookup. Invented people. The invariant is on the FORMS ON FILE block the
 * answering model was given, not on its scripted words.
 */

const QUESTION = "does Lucía Ramírez have any coachings?";
const REPORT = "QA's code audit item 13 (ported): an accented name (Ramírez) was read as two words, and matched nobody";

function onFile(t: ReplayContext, employeeName = "Lucia Ramirez"): void {
  (t.forms() as Record<string, unknown>[]).push({
    id: "nov20-accent-1",
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
    template_key: "coaching",
    template_name: "Coaching Form",
    employee_name: employeeName,
    form_date: "2026-11-10",
    created_at: "2026-11-10T15:00:00Z",
    updated_at: "2026-11-10T15:00:00Z",
  });
}

export const NOV20_FORMS_ON_FILE_ACCENTED_NAMES_CASES: ReplayCase[] = [
  {
    id: "nov20-forms-on-file-accented-name-named",
    title: `"${QUESTION}" with a coaching on file for Lucia Ramirez: the model is given that form as naming the person`,
    report: REPORT,
    // Not behind a flag.
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-18T18:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      onFile(t);
      t.modelSays("Lucia Ramirez has one coaching on file.");
      await t.thread().say(QUESTION);
      const system = t.lastFormRecords?.() ?? "";
      expect(system, `the form on file was not named:\n${system}`).toContain("Forms naming the person in the question (1)");
      expect(system).toContain("Lucia Ramirez;");
    },
  },
  /*
   * Port from the sibling app's #1171 (QA's f072, 20 Nov 2026): the database's ilike compared the letters as stored, so a
   * question typed WITHOUT the accents never read a form stored WITH them. The overview's employee_name_folded
   * (migration 20261120002000; the harness's overview carries it as the migration defines it) is matched as well.
   */
  {
    id: "nov20-forms-on-file-unaccented-question-finds-accented-form",
    title: '"does lucia ramirez have any coachings?" with a coaching on file for Lucía Ramírez (accents): the model is given that form as naming the person',
    report: "QA's f072 (20 Nov 2026, ported): \"lucia ramirez\" never found a form stored as \"Lucía Ramírez\"",
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-18T18:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      onFile(t, "Lucía Ramírez");
      t.modelSays("Lucía Ramírez has one coaching on file.");
      await t.thread().say("does lucia ramirez have any coachings?");
      const system = t.lastFormRecords?.() ?? "";
      expect(system, `the form stored with accents was not found by the name typed without them:\n${system}`).toContain("Forms naming the person in the question (1)");
      expect(system).toContain("Lucía Ramírez;");
    },
  },
  {
    id: "nov20-forms-on-file-accented-question-finds-plain-form",
    title: 'The reverse: "does Inés Peñalver have any coachings?" with a coaching on file for Ines Penalver: the model is given that form as naming the person',
    report: "QA's f072 (20 Nov 2026, ported): accents typed in the question never hide a form stored without them",
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-18T18:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      onFile(t, "Ines Penalver");
      t.modelSays("Ines Penalver has one coaching on file.");
      await t.thread().say("does Inés Peñalver have any coachings?");
      const system = t.lastFormRecords?.() ?? "";
      expect(system, `the form stored without accents was not found:\n${system}`).toContain("Forms naming the person in the question (1)");
    },
  },
];
