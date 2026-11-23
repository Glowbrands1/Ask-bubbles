import { expect, vi } from "vitest";

import { hrApprovalEnabled } from "@/lib/forms/hr-approval-rules";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * HR APPROVAL: "MANAGER REPLIED TO CHANGES", APPROVE, AND WHAT THE AI READS (owner, 23 Nov 2026; CLAUDE.md rule 5)
 * ============================================================================
 *
 * The owner: "colene sent to marissa, marissa replied and it shows … 'sent back for changes' still. it should be
 * Manager Replied to changes. then view then approve." HR sent a Corrective Action back; the manager answered with a
 * note. The AI reads it through read_hr_approvals, scoped like the page:
 *
 *   HR              "what's waiting on me?"                     the replied form, as waiting for them
 *   the manager     "was my CA for <P> approved?"               their own form, approved by HR
 *   the manager     "add to it that …" on a form sent back       edit_form saves (it is theirs to change)
 *   the manager     "add to it that …" on a form waiting for HR  refused, with the reason: HR has it
 *
 * Invented people and accounts, never the ones in the owner's screenshots.
 */
const REPORT = "Owner, 23 Nov 2026: a sent-back form the manager replied to still read \"Sent back for changes\" on HR's list; HR should see \"Manager replied to changes\", then view, then approve";
const FLAGS = ["AGENT_LOOP_ENABLED", "FORMS_HR_APPROVAL_ENABLED"];
const GLOBAL = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const HR_ACCOUNT = "hr-corwin-ashby";

const ROSALIND: DirectoryRow = {
  id: "e-rosalind-tetherby",
  firstName: "Rosalind",
  lastName: "Tetherby",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

/** A Corrective Action draft for Rosalind Tetherby from a store manager's card; returns its id and the thread it was made in. */
async function corrective(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-23T16:00:00Z"));
  t.directory([ROSALIND]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  t.loopModel!(loopStandIn((view) =>
    lastResult(view, "propose_form")
      ? { text: "Here's the Corrective Action Form for **Rosalind Tetherby**." }
      : { tool: "propose_form", input: { template_key: "dpoa", employee_id: ROSALIND.id, policy: "Attendance", what_happened: "Rosalind Tetherby was late to her shift." } },
  ));
  await thread.say("write up Rosalind Tetherby for being late to her shift");
  const id = await thread.create();
  const row = (t.rows?.("form_instances") ?? []).find((candidate) => candidate.id === id);
  expect(row, "the card created no form").toBeDefined();
  return { id, row: row!, thread, creator: String(row!.created_by) };
}

/** An active HR approver (`form_hr_approvers` and an active account), so the hold is live (`hrHoldLive`). */
function hrApprover(t: ReplayContext) {
  t.addRows!("form_hr_approvers", [{ app_user_id: HR_ACCOUNT, revoked_at: null }]);
  t.addRows!("app_users", [{ id: HR_ACCOUNT, email: "hr.corwin@example.com", display_name: "Corwin", status: "active" }]);
}

/** As `decideHrApproval(…, "send_back")` and the manager's `commentOnHrApproval` leave it. */
function sentBackAndReplied(t: ReplayContext, form: { id: string; row: Record<string, unknown>; creator: string }) {
  form.row.hr_approval_state = "changes_requested";
  form.row.hr_approval_requested_at = "2026-11-20T15:00:00Z";
  hrApprover(t);
  t.addRows!("form_hr_approval_events", [
    { instance_id: form.id, action: "submitted", actor: form.creator, note: null, created_at: "2026-11-20T15:00:00Z" },
    { instance_id: form.id, action: "changes_requested", actor: HR_ACCOUNT, note: "Add the time she arrived.", created_at: "2026-11-20T18:00:00Z" },
    { instance_id: form.id, action: "commented", actor: form.creator, note: "She arrived at 9:20.", created_at: "2026-11-21T14:00:00Z" },
  ]);
}

function readsHr(t: ReplayContext) {
  const model = loopStandIn((view: LoopView): LoopDecision =>
    lastResult(view, "read_hr_approvals") ? { text: "Here is where the forms are with HR." } : { tool: "read_hr_approvals", input: {} },
  );
  t.loopModel!(model);
  return () => (model.views.flatMap((view) => view.results.filter((result) => result.tool === "read_hr_approvals")).at(-1)?.output ?? {}) as Record<string, unknown>;
}

const skip = (t: ReplayContext) => !t.loopOn?.() || !hrApprovalEnabled();

export const NOV23_HR_APPROVAL_MANAGER_REPLIED_CASES: ReplayCase[] = [
  {
    id: "nov23-hr-approval-manager-replied-is-waiting-for-hr",
    title: 'HR: "what\'s waiting on me?" after the manager replied to HR\'s changes: the form is waiting for HR, "manager replied to changes"',
    report: REPORT,
    status: "fixed",
    fixFlags: FLAGS,
    async run(t) {
      if (skip(t)) return;
      const form = await corrective(t);
      sentBackAndReplied(t, form);
      t.as("district_manager", GLOBAL, HR_ACCOUNT);
      const result = readsHr(t);
      await t.thread().say("what's waiting on me?");
      const output = result();
      const waiting = output.waiting_for_you as Record<string, unknown>[];
      expect(waiting, `the manager's reply did not put the form back with HR:\n${JSON.stringify(output)}`).toHaveLength(1);
      expect(JSON.stringify(waiting[0])).toMatch(/Corrective Action Form for Rosalind Tetherby/);
      expect(String(waiting[0]!.state)).toMatch(/^manager replied to changes/);
      expect(output.sent_back_or_rejected).toEqual([]);
    },
  },
  {
    id: "nov23-hr-approval-was-my-ca-approved",
    title: 'the manager: "was my CA for Rosalind approved?" after HR approved it: read_hr_approvals gives their form, approved by HR',
    report: REPORT,
    status: "fixed",
    fixFlags: FLAGS,
    async run(t) {
      if (skip(t)) return;
      const form = await corrective(t);
      sentBackAndReplied(t, form);
      // As `decideHrApproval(…, "approve")` leaves it: finalized and approved in one write.
      form.row.status = "finalized";
      form.row.hr_approval_state = "approved";
      form.row.updated_at = "2026-11-23T15:00:00Z";
      t.as("location_manager", WEST_DODGE);
      const result = readsHr(t);
      await t.thread().say("was my CA for Rosalind approved?");
      const forms = result().your_forms_with_hr as Record<string, unknown>[];
      expect(forms, "the manager's approved form did not reach the model").toHaveLength(1);
      expect(JSON.stringify(forms[0])).toMatch(/Corrective Action Form for Rosalind Tetherby/);
      expect(forms[0]!.state).toBe("Approved by HR");
    },
  },
  {
    id: "nov23-hr-approval-edit-form-saves-on-a-sent-back-form",
    title: 'the manager, on a form HR sent back: "add to the observation that she arrived at 9:20": edit_form saves it (the form is theirs to change)',
    report: REPORT,
    status: "fixed",
    fixFlags: FLAGS,
    async run(t) {
      if (skip(t)) return;
      const form = await corrective(t);
      sentBackAndReplied(t, form);
      const added = "Rosalind Tetherby arrived at 9:20.";
      const model = loopStandIn((view: LoopView): LoopDecision =>
        lastResult(view, "edit_form") ? { text: "Added it to the observation." } : { tool: "edit_form", input: { instance_id: form.id, values: { observation: `Rosalind Tetherby was late to her shift.\n${added}` } } },
      );
      t.loopModel!(model);
      await form.thread.say("add to the observation that she arrived at 9:20");
      const output = model.views.flatMap((view) => view.results.filter((result) => result.tool === "edit_form")).at(-1)?.output as Record<string, unknown> | undefined;
      expect(output?.error, JSON.stringify(output)).toBeUndefined();
      expect(t.values(form.id).observation ?? "", "the sent-back form was not changed").toContain("arrived at 9:20");
    },
  },
  {
    id: "nov23-hr-approval-edit-form-refused-while-hr-has-it",
    title: 'the manager, on a form waiting for HR: "add to the observation that she arrived at 9:20": edit_form is refused and says HR has it; nothing changes',
    report: REPORT,
    status: "fixed",
    fixFlags: FLAGS,
    async run(t) {
      if (skip(t)) return;
      const form = await corrective(t);
      form.row.hr_approval_state = "pending";
      form.row.hr_approval_requested_at = "2026-11-23T15:00:00Z";
      hrApprover(t);
      const before = t.values(form.id).observation ?? "";
      const model = loopStandIn((view: LoopView): LoopDecision =>
        lastResult(view, "edit_form") ? { text: "That form is with HR right now." } : { tool: "edit_form", input: { instance_id: form.id, values: { observation: `${before}\nRosalind Tetherby arrived at 9:20.` } } },
      );
      t.loopModel!(model);
      await form.thread.say("add to the observation that she arrived at 9:20");
      const output = model.views.flatMap((view) => view.results.filter((result) => result.tool === "edit_form")).at(-1)?.output as Record<string, unknown> | undefined;
      expect(String(output?.error ?? ""), `edit_form did not refuse:\n${JSON.stringify(output)}`).toMatch(/HR/);
      expect(t.values(form.id).observation ?? "", "a form waiting for HR was changed").toBe(before);
    },
  },
];
