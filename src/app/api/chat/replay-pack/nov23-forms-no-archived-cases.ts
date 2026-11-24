import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * NO ARCHIVED FORMS: A FORM IS ONLY DRAFT OR FINALIZED (Pau, 23 Nov 2026; port of the sibling app 8376613)
 * ============================================================================
 *
 * Pau, on the Forms Register (exact words): "the archived should not be acknowledged as a form, all just should be finalized or
 * drafted." Archiving is removed from the app (no Archived view, badge or Archive / Restore action; the API has no archive
 * verb). What the AI reads follows: a manager asking how many forms are on file gets the same numbers the Forms Register shows,
 * every form under draft or finalized, with no archived bucket, no "(archived)" mark and no archived draft left out.
 *
 * The fixture still sets `archived_at` on two rows (what production holds until the unarchive migration
 * `20261124001000_forms_unarchive.sql` runs), to prove the readers ignore the old flag. Invented names only.
 *
 * Production's flags: the agent loop is on for every manager (AGENT_LOOP_ENABLED, AGENT_LOOP_USERS "*"), so that case holds
 * today. The chat's own FORMS ON FILE counts block is behind FORMS_ON_FILE_COUNTS_ENABLED (off in production), so that case
 * runs with the fix flag.
 */

const REPORT = "Pau, 23 Nov 2026: \"the archived should not be acknowledged as a form, all just should be finalized or drafted.\"";

const ODESSA: DirectoryRow = { id: "e-odessa-quill", firstName: "Odessa", lastName: "Quill", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

/** [date, status, employee, flagged by the old archived flag]: 8 forms in November, 5 drafts and 3 finalized. */
const FORMS: readonly [string, "draft" | "finalized", string, boolean][] = [
  ["2026-11-03", "draft", "Odessa Quill", false],
  ["2026-11-05", "finalized", "Odessa Quill", false],
  ["2026-11-09", "draft", "Perrin Hale", false],
  ["2026-11-12", "draft", "Perrin Hale", true],
  ["2026-11-16", "finalized", "Tamsin Rook", true],
  ["2026-11-18", "draft", "Tamsin Rook", false],
  ["2026-11-19", "finalized", "Wilder Voss", false],
  ["2026-11-20", "draft", "Wilder Voss", false],
];

type Counts = { total: number; by_person: { employee: string; total: number; by_form: { by_date: { statuses: Record<string, number> }[] }[] }[] };
type Out = { counts?: Counts; forms?: { status?: string }[]; complete?: boolean };

const QUESTION = "how many forms are on file this month?";

/** The statuses the counts name, however they are split by person and date. */
const statusNames = (counts: Counts | undefined) => [...new Set((counts?.by_person ?? []).flatMap((person) => person.by_form.flatMap((form) => form.by_date.flatMap((day) => Object.keys(day.statuses)))))].sort();

/** The 8 forms, as rows the fake database holds; `archived_at` is set on two of them, as production's old rows are. */
function fileForms(t: ReplayContext, idPrefix: string, role: string): void {
  const forms = t.forms() as Record<string, unknown>[];
  FORMS.forEach(([date, status, employee, flagged], n) => {
    forms.push({
      id: `${idPrefix}-${n}`, ...t.templateIds!("dpoa"), variant_key: null, employee_role: null,
      location_id: WEST_DODGE.primaryAreaId, location_name: "Omaha, West Dodge Rd",
      created_by: "another-manager", created_by_role: role, source: "chat", status, follow_up_date: null,
      archived_at: flagged ? `${date}T23:00:00Z` : null,
      revises_instance_id: null, template_key: "dpoa", template_name: "Corrective Action Form",
      employee_name: employee, form_date: date, created_at: `${date}T10:00:00Z`, updated_at: `${date}T10:00:00Z`,
    });
  });
}

export const NOV23_FORMS_NO_ARCHIVED_CASES: ReplayCase[] = [
  {
    id: "nov23-no-archived-forms-loop-how-many-on-file",
    title: "\"how many forms are on file this month?\" (agent loop, production's flags): counts are 8 forms, 5 draft and 3 finalized, under draft or finalized only: no archived bucket, no archived mark, no form left out for having been archived",
    report: REPORT,
    status: "fixed",
    async run(t: ReplayContext) {
      vi.setSystemTime(new Date("2026-11-20T20:54:00Z"));
      t.directory([...LOOP_STAFF, ODESSA]);
      t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
      fileForms(t, "nov23", "location_manager");
      const seen: Out[] = [];
      t.loopModel!(loopStandIn((view: LoopView): LoopDecision => {
        const results = view.results.filter((result) => result.tool === "find_past_forms");
        if (results.length === 0) return { tool: "find_past_forms", input: { form: "CA", date_from: "2026-11-01", date_to: "2026-11-20", forms_on_file_evidence: evidenceFrom(view, QUESTION) } };
        seen.push(...results.map((result) => result.output as Out));
        return { text: "Here's what's on file." };
      }));
      await t.thread().say(QUESTION);
      const read = seen[0];
      expect(read?.counts?.total, JSON.stringify(read?.counts)).toBe(8);
      expect(statusNames(read?.counts)).toEqual(["draft", "finalized"]);
      expect((read?.forms ?? []).filter((form) => form.status === "draft").length).toBe(5);
      expect((read?.forms ?? []).filter((form) => form.status === "finalized").length).toBe(3);
      expect(JSON.stringify(read), "an archived bucket or mark reached the model").not.toMatch(/archiv/i);
    },
  },
  {
    id: "nov23-no-archived-forms-chat-how-many-on-file",
    title: "\"how many CA forms are on file this month?\" (the chat's FORMS ON FILE block): COUNTS cover all 8 forms under draft or finalized only; no \"(archived)\", and no archived draft left out",
    report: REPORT,
    // Off in production: the chat's counts block is behind FORMS_ON_FILE_COUNTS_ENABLED (QA turns it on after a live test).
    status: { open: "FORMS_ON_FILE_COUNTS_ENABLED is off in production (QA turns it on after a live test)" },
    fixFlags: ["FORMS_ON_FILE_COUNTS_ENABLED", "FORMS_ON_FILE_DATE_RANGE_ENABLED"],
    async run(t: ReplayContext) {
      vi.setSystemTime(new Date("2026-11-20T20:54:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      fileForms(t, "nov23-chat", "location_manager");
      t.modelSays("Here are the forms on file.");
      await t.thread().say("how many CA forms are on file this month?");
      const block = t.lastFormRecords?.() ?? "";
      expect(block, block).toMatch(/COUNTS \(code counted every form the read found: 8\)/);
      expect(block).toMatch(/draft \d/);
      expect(block).toMatch(/finalized \d/);
      expect(block, "an archived bucket or mark reached the model").not.toMatch(/\(archived\)/i);
    },
  },
];
