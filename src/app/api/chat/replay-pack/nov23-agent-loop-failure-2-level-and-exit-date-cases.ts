import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * FAILURE 2, ITEMS 1 AND 7 (port of the sibling app's #1297; Pau's review of a live chat there, via QA, 23 Nov 2026)
 * ============================================================================
 *
 * An area manager pasted HR's edit request for an employee's exit form ("… gave verbal notice of her immediate
 * resignation …"). The reply said no exit form was on file and listed Corrective Actions: find_past_forms narrowed by
 * the level "verbal" read anywhere in the message, and every form of another kind was dropped (item 1). Then "her last
 * day worked was 11/17/2026 …" dated the exit card 11/17, the last day worked (item 7). The manager's turns, this app's
 * wording, every person invented.
 */

const REPORT = "Pau's review via QA (23 Nov 2026, the sibling app's #1297, Failure 2): HR's pasted \"gave verbal notice\" hid the exit form on file behind the Verbal CAs; the exit card was dated the last day worked";
const PERPETUA: DirectoryRow = { id: "e-perpetua-lindqvist", firstName: "Perpetua", lastName: "Lindqvist", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const HR_EDITS =
  "make these edits on perpetua lindqvist exit Hi,\nPlease make the following edits and resubmit for approval:\n\n    Remove dates for notice given and notice fulfilled.\n\n    How Employee Resigned should state: Perpetua gave verbal notice of her immediate resignation to the Assistant General Manager\n    Additional Details should read: Perpetua voluntarily ended her employment effective immediately";
const LAST_DAY = "her last day worked was 11/17/2026. she forfeits her bonus";

type Row = Record<string, unknown>;

/** Perpetua's forms on file: a Verbal CA, a Written CA, a Coaching Form, and her finalized exit form of 11/20. */
function onFile(t: ReplayContext, withExit = true): void {
  const row = (key: string, name: string, id: string, formDate: string): Row => ({
    id, ...t.templateIds!(key), variant_key: null, employee_role: null, location_id: WEST_DODGE.primaryAreaId, location_name: "Omaha, West Dodge Rd",
    created_by: "another-manager", created_by_role: "location_manager", source: "ask_sunny", status: "finalized", follow_up_date: null, archived_at: null,
    revises_instance_id: null, template_key: key, template_name: name, employee_name: "Perpetua Lindqvist", form_date: formDate,
    created_at: `${formDate}T15:00:00Z`, updated_at: `${formDate}T15:00:00Z`,
  });
  (t.forms() as Row[]).push(
    row("dpoa", "Corrective Action Form", "ca-perpetua-1111", "2026-11-11"),
    row("dpoa", "Corrective Action Form", "ca-perpetua-1116", "2026-11-16"),
    row("coaching", "Coaching Form", "co-perpetua-1109", "2026-11-09"),
    ...(withExit ? [row("resignation-exit", "Resignation/Exit Form", "exit-perpetua-1120", "2026-11-20")] : []),
  );
  /* Each Corrective Action's own Type of Warning, as on the live forms: HR's "gave verbal notice" names one of them. */
  t.checkOnForm!("ca-perpetua-1111", { warning_type: ["verbal"] });
  t.checkOnForm!("ca-perpetua-1116", { warning_type: ["written"] });
  /* The finalized exit form as the live record had it: notice dates entered, typed by the manager. */
  if (withExit) t.typeOnForm("exit-perpetua-1120", { notice_given_date: "2026-11-17", notice_fulfilled_date: "2026-11-17", resignation_method: "Verbal", details: "Perpetua quit." });
}

function start(t: ReplayContext, withExit = true): void {
  vi.setSystemTime(new Date("2026-11-23T18:00:00Z"));
  t.directory([...LOOP_STAFF, PERPETUA]);
  t.as("location_manager", WEST_DODGE);
  onFile(t, withExit);
}

const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";

export const NOV23_AGENT_LOOP_FAILURE_2_LEVEL_AND_EXIT_DATE_CASES: ReplayCase[] = [
  {
    id: "nov23-f2-hr-verbal-notice-never-hides-exit-form",
    title: "Failure 2, item 1: HR's edit request pasted (\"… gave verbal notice of her immediate resignation …\"), the model looking up Perpetua's exit form: the exit form on file of 11/20 is found, never hidden behind the Verbal Corrective Action",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const found: { forms?: { instance_id?: string }[]; best_match?: string }[] = [];
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "find_past_forms") as (typeof found)[number] | null;
        if (result) {
          found.push(result);
          return { text: "Here is what's on file." };
        }
        return { tool: "find_past_forms", input: { employee_name: "Perpetua Lindqvist", form: "exit form", open: true, forms_on_file_evidence: evidenceFrom(view, "make these edits on perpetua lindqvist exit") } };
      }), { scripted: true });
      const reply = await t.thread().say(HR_EDITS);
      const ids = found.flatMap((result) => [...(result.forms ?? []).map((form) => form.instance_id), ...(result.best_match ? [result.best_match] : [])]);
      expect(ids, `the exit form on file was dropped:\n${JSON.stringify(found).slice(0, 600)}\n${reply.content}`).toContain("exit-perpetua-1120");
    },
  },
  {
    id: "nov23-f2-verbal-ca-asked-still-singles-it-out",
    title: "Control (U16 kept): \"put up the verbal CA for Perpetua Lindqvist\" (the forms asked about are Corrective Actions) still singles out the Verbal one",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t, false);
      const found: { forms?: { instance_id?: string }[]; best_match?: string }[] = [];
      const ask = "put up the verbal CA for Perpetua Lindqvist";
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "find_past_forms") as (typeof found)[number] | null;
        if (result) {
          found.push(result);
          return { text: "Here it is." };
        }
        return { tool: "find_past_forms", input: { employee_name: "Perpetua Lindqvist", form: "verbal CA", open: true, forms_on_file_evidence: evidenceFrom(view, ask) } };
      }), { scripted: true });
      await t.thread().say(ask);
      const ids = [...new Set(found.flatMap((result) => [...(result.forms ?? []).map((form) => form.instance_id), ...(result.best_match ? [result.best_match] : [])]))];
      expect(ids, JSON.stringify(found).slice(0, 600)).toEqual(["ca-perpetua-1111"]);
    },
  },
  {
    id: "nov23-f2-exit-last-day-worked-is-not-the-form-date",
    title: "Failure 2, item 7: \"her last day worked was 11/17/2026 …\" with the model sending 11/17 as the date, as live: the exit card's form date stays today's, never the last day worked",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t, false);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Here's the Resignation/Exit Form for **Perpetua**." };
        const first = said(view) === LAST_DAY ? 1 : 0;
        return {
          tool: "propose_form",
          input: {
            template_key: "resignation-exit", employee_id: PERPETUA.id, exit_type: "resignation",
            exit_evidence: { ...evidenceFrom(view, "make an exit form for perpetua lindqvist", first), kind: "asks_for_exit_form" },
            person_evidence: evidenceFrom(view, "perpetua lindqvist", first),
            ...(said(view) === LAST_DAY ? { incident_date: "11/17/2026" } : {}),
          },
        };
      }), { scripted: true });
      const thread = t.thread();
      await thread.say("make an exit form for perpetua lindqvist");
      const reply = await thread.say(LAST_DAY);
      expect(thread.proposal?.templateKey, reply.content).toBe("resignation-exit");
      expect(thread.proposal?.formDate ?? null, `the form date moved to the last day worked:\n${reply.content}`).not.toBe("2026-11-17");
    },
  },
  {
    id: "nov23-f2-hr-edits-revise-the-finalized-exit-form",
    title: "Failure 2, item 4: HR's edits pasted (\"Remove dates for notice given and notice fulfilled\", How Employee Resigned and Additional Details restated) edit the finalized exit form through a revision: both notice dates cleared, the two fields as HR wrote them, each named in the result; the finalized original untouched",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const edits: Row[] = [];
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const edited = lastResult(view, "edit_form") as Row | null;
        if (edited) {
          edits.push(edited);
          return { text: "Done." };
        }
        if (!lastResult(view, "find_past_forms")) return { tool: "find_past_forms", input: { employee_name: "Perpetua Lindqvist", form: "exit form", open: true, forms_on_file_evidence: evidenceFrom(view, "make these edits on perpetua lindqvist exit") } };
        return {
          tool: "edit_form",
          input: {
            instance_id: "exit-perpetua-1120",
            forms_on_file_evidence: evidenceFrom(view, "make these edits on perpetua lindqvist exit"),
            values: {
              notice_given_date: "",
              notice_fulfilled_date: "",
              resignation_method: "Perpetua gave verbal notice of her immediate resignation to the Assistant General Manager",
              details: "Perpetua voluntarily ended her employment effective immediately",
            },
            clear_evidence: { notice_given_date: "Remove dates for notice given and notice fulfilled", notice_fulfilled_date: "Remove dates for notice given and notice fulfilled" },
          },
        };
      }), { scripted: true });
      await t.thread().say(HR_EDITS);
      const exits = (t.forms() as Row[]).filter((row) => row.template_key === "resignation-exit");
      const revision = exits.find((row) => row.revises_instance_id === "exit-perpetua-1120");
      expect(revision, `no revision of the finalized exit form:\n${JSON.stringify(edits.at(-1)).slice(0, 600)}`).toBeTruthy();
      const now = t.values(String(revision!.id));
      expect(now.notice_given_date ?? "", `notice given still dated:\n${JSON.stringify(edits.at(-1)).slice(0, 900)}`).toBe("");
      expect(now.notice_fulfilled_date ?? "", "notice fulfilled still dated").toBe("");
      expect(now.resignation_method).toMatch(/gave verbal notice of her immediate resignation/);
      expect(now.details).toMatch(/voluntarily ended her employment effective immediately/);
      const named = JSON.stringify((edits.at(-1) as { stated_edits?: unknown })?.stated_edits ?? []);
      for (const label of ["Date that notice was given", "Date that notice was fulfilled", "How Employee Resigned", "Additional Details"]) expect(named, `stated_edits never names ${label}`).toContain(label);
      expect(t.values("exit-perpetua-1120").notice_given_date, "the finalized original changed").toBe("2026-11-17");
    },
  },
  {
    id: "nov23-f2-model-only-clear-keeps-typed-field",
    title: "Item 4, control: the model sends a notice date empty with no words of this message naming it (no clear_evidence): the manager's typed date stays, never cleared by the model alone",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const said = "make these edits on perpetua lindqvist exit: Additional Details should read: Perpetua voluntarily ended her employment effective immediately";
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (lastResult(view, "edit_form")) return { text: "Done." };
        if (!lastResult(view, "find_past_forms")) return { tool: "find_past_forms", input: { employee_name: "Perpetua Lindqvist", form: "exit form", open: true, forms_on_file_evidence: evidenceFrom(view, "make these edits on perpetua lindqvist exit") } };
        return { tool: "edit_form", input: { instance_id: "exit-perpetua-1120", forms_on_file_evidence: evidenceFrom(view, "make these edits on perpetua lindqvist exit"), values: { notice_given_date: "", details: "Perpetua voluntarily ended her employment effective immediately" } } };
      }), { scripted: true });
      await t.thread().say(said);
      const revision = (t.forms() as Row[]).find((row) => row.revises_instance_id === "exit-perpetua-1120");
      expect(revision, "no revision").toBeTruthy();
      const now = t.values(String(revision!.id));
      expect(now.details).toMatch(/voluntarily ended her employment/);
      expect(now.notice_given_date, "the model alone cleared a date the manager typed").toBe("2026-11-17");
    },
  },
];
