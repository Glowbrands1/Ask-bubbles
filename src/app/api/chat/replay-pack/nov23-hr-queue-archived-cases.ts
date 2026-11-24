import { expect, vi } from "vitest";

import { hrApprovalEnabled } from "@/lib/forms/hr-approval-rules";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * AN ARCHIVED FORM IS NOT WAITING ON HR (QA, 23 Nov 2026)
 * ============================================================================
 *
 * QA: "An archived form that was pending HR must never show in 'Needs your decision', be counted, or ring a bell."
 * Archiving leaves the form's HR state as it was, so HR's queue leaves archived forms out itself (`listHrQueue`), and
 * read_hr_approvals, which reads that queue, never hands one to the model. The employee and the HR account are invented.
 */
const REPORT = "QA, 23 Nov 2026: an archived form that was pending HR must never show in Needs your decision, be counted, or ring a bell";
const FLAGS = ["AGENT_LOOP_ENABLED", "FORMS_HR_APPROVAL_ENABLED"];
const GLOBAL = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const HR_ACCOUNT = "hr-wren-oakfield";

const LARKSPUR: DirectoryRow = {
  id: "e-larkspur-fenwick",
  firstName: "Larkspur",
  lastName: "Fenwick",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

/** A Corrective Action draft for Larkspur Fenwick, created from a card, sent to HR, then archived. */
async function sentToHrThenArchived(t: ReplayContext): Promise<string> {
  vi.setSystemTime(new Date("2026-11-23T16:00:00Z"));
  t.directory([LARKSPUR]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  t.loopModel!(loopStandIn((view) =>
    lastResult(view, "propose_form")
      ? { text: "Here's the Corrective Action Form for **Larkspur Fenwick**." }
      : { tool: "propose_form", input: { template_key: "dpoa", employee_id: LARKSPUR.id, policy: "Attendance", what_happened: "Larkspur Fenwick was late to her shift." } },
  ));
  await thread.say("write up Larkspur Fenwick for being late to her shift");
  const id = await thread.create();
  const row = (t.rows?.("form_instances") ?? []).find((candidate) => candidate.id === id);
  expect(row, "the card created no form").toBeDefined();
  // As `sendForHrApproval` leaves it, then as `archiveInstance` leaves it: still a draft, still pending, archived.
  row!.hr_approval_state = "pending";
  row!.hr_approval_requested_at = "2026-11-20T15:00:00Z";
  row!.archived_at = "2026-11-23T15:00:00Z";
  return id;
}

export const NOV23_HR_QUEUE_ARCHIVED_CASES: ReplayCase[] = [
  {
    id: "nov23-hr-queue-archived-form-not-waiting",
    title: 'HR: "what\'s waiting on me?" when the only form sent to HR was archived: read_hr_approvals lists nothing, and the archived form never reaches the model',
    report: REPORT,
    status: "fixed",
    fixFlags: FLAGS,
    async run(t) {
      if (!t.loopOn?.() || !hrApprovalEnabled()) return;
      const id = await sentToHrThenArchived(t);
      t.addRows!("form_hr_approvers", [{ app_user_id: HR_ACCOUNT, revoked_at: null }]);
      t.as("district_manager", GLOBAL, HR_ACCOUNT);
      const model = loopStandIn((view: LoopView): LoopDecision =>
        lastResult(view, "read_hr_approvals") ? { text: "Nothing is waiting for your approval." } : { tool: "read_hr_approvals", input: {} },
      );
      t.loopModel!(model);
      await t.thread().say("what's waiting on me?");
      const outputs = model.views.flatMap((view) => view.results.filter((result) => result.tool === "read_hr_approvals"));
      expect(outputs, "read_hr_approvals was not called").not.toEqual([]);
      const output = (outputs.at(-1)?.output ?? {}) as Record<string, unknown>;
      expect(output.reader).toBe("HR approver");
      expect(output.waiting_for_you ?? [], "the archived form was listed as waiting for HR").toEqual([]);
      const seen = JSON.stringify(outputs);
      expect(seen).not.toContain(id);
      expect(seen).not.toMatch(/Larkspur Fenwick/);
    },
  },
];
