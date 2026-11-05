import { expect, vi } from "vitest";
import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/*
 * A SECOND FORM WHILE A CARD IS OPEN (QA, 5 Nov 2026). Found while checking
 * that REPLY_CUT_CHECK_ENABLED never blocks a second form: with a Corrective
 * Action card open for one employee, "also make a coaching form for <another>"
 * gives a Coaching Form card for the FIRST employee. The sibling app gives the
 * named one (its SECOND_FORM_ENABLED is on in production); this app's
 * production does not set SECOND_FORM_ENABLED, and turning it on here does
 * not fix this either (checked, 5 Nov 2026). Recorded, not fixed.
 * The people are the pack's invented staff.
 */
const REPORT = "QA, 5 Nov 2026: a second form asked for while a Corrective Action card is open";
const [A, B] = [STAFF[0]!, STAFF[1]!];
const nameOf = (row: { firstName: string; lastName: string }) => `${row.firstName} ${row.lastName}`;

export const NOV5_SECOND_FORM_CASES: readonly ReplayCase[] = (["card", "created"] as const).map(
  (mode): ReplayCase => ({
    id: `nov5-second-form-other-person-${mode}`,
    title: `"also make a coaching form for <another>" with a Corrective Action ${mode === "card" ? "card in progress" : "draft created"}: the Coaching Form is for the person named`,
    report: REPORT,
    status: { open: "with a Corrective Action open, the Coaching Form is drafted for that employee, not the one named (SECOND_FORM_ENABLED on does not fix it)" },
    async run(t) {
      vi.setSystemTime(new Date("2026-11-05T15:30:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say(`create a corrective action for ${nameOf(A)} for opening the store late on 11-03-26, verbal warning, no payroll deduction`);
      if (mode === "created") {
        t.draftWrites({});
        await thread.create();
      }
      const reply = await thread.say(`also make a coaching form for ${nameOf(B)}`);
      expect(reply.formProposal?.templateKey, `no Coaching Form card:\n${reply.content}`).toBe("coaching");
      expect(reply.formProposal?.employeeName, `the Coaching Form is not for ${nameOf(B)}:\n${reply.content}`).toBe(nameOf(B));
    },
  }),
);
