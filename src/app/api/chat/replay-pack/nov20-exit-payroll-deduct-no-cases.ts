import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * "PAYROLL DEDUCT NO APPLY" IS NO ON THE EXIT FORM (ported from the sibling app: QA's production audit of an exit
 * form, 20 Nov 2026)
 * ============================================================================
 *
 * The manager's wording, "create exit for <name>. payroll deduct no apply", with an invented person from the pack's
 * STAFF: the exit form's "Is Payroll Deduction applicable?" was saved as Yes. The same reader (`exit-details.ts`) writes
 * that question here, through the real chat route and Create with production's flags.
 */
const REPORT = "QA's production audit of an exit form (20 Nov 2026), ported: \"payroll deduct no apply\" saved Yes";

function payrollCase(id: string, said: string): ReplayCase {
  return {
    id,
    title: `"${said}": the exit form's payroll deduction question is No`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-20T16:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const card = await thread.say(said);
      expect(card.formProposal, `no exit card:\n${card.content}`).toMatchObject({ employeeName: "Remy Calder" });
      expect(card.content, "the card reads the payroll answer as Yes").not.toMatch(/Payroll Deduction:\*\* Payroll deduction applies/i);
      const id = await thread.create();
      expect(t.checked(id).payroll_deduction_applicable ?? [], "payroll deduction not ticked No").toEqual(["no"]);
    },
  };
}

export const NOV20_EXIT_PAYROLL_DEDUCT_NO_CASES: readonly ReplayCase[] = [
  payrollCase("nov20-exit-payroll-deduct-no-apply", "create exit for remy calder. payroll deduct no apply"),
  payrollCase("nov20-exit-payroll-deduct-no", "create exit for remy calder, she resigned, last day 11/18/26. payroll deduct no"),
];
