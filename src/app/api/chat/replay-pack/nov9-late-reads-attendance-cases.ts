import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * "SHE WAS LATE" IS ATTENDANCE, WHATEVER THE MODEL'S HEADING (a guard here; the sibling app's LATE_READS_ATTENDANCE)
 * ============================================================================
 *
 * QA, the sibling app's round-10 live test (9 Nov 2026): "create a CA for <P>, she was late on 11/6/26" cited Late
 * Opening in 1 of 6 runs there, from the model's heading. Here the plain late reads as Attendance from the manual's own
 * words, and "late opening the store" as Late Opening, under either heading: checked on main 4060d6de, a guard with the
 * model scripted to the other heading. QA's wording; the pack's invented person.
 */
const REPORT = "QA, the sibling app's round-10 live test (9 Nov 2026): \"she was late on 11/6/26\" cited Late Opening in 1 of 6 runs";
const POLICY = (content: string) => /^\*\*Policy:\*\*[^\n]*/m.exec(content)?.[0] ?? "";

async function card(t: ReplayContext, said: string, heading: string) {
  vi.setSystemTime(new Date("2026-11-09T16:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  t.slotsRead({ policyHeading: heading });
  return (await t.thread().say(said)).content;
}

export const NOV9_LATE_READS_ATTENDANCE_CASES: ReplayCase[] = [
  {
    id: "nov9-late-reads-attendance",
    title: "\"create a CA for <P>, she was late on 11/6/26\", the model's heading Late Opening: the card cites Attendance",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const content = await card(t, "create a CA for Marnie Holloway, she was late on 11/6/26", "Late Opening");
      expect(POLICY(content), `the Policy line:\n${content}`).toMatch(/^\*\*Policy:\*\* Attendance\b/);
    },
  },
  {
    id: "nov9-late-opening-stays-late-opening",
    title: "must not change: \"create a CA for <P>, late opening the store on 11/6/26\" cites Late Opening, whatever the heading",
    report: REPORT,
    status: "fixed",
    async run(t) {
      for (const heading of ["Late Opening", "Attendance"]) {
        const content = await card(t, "create a CA for Marnie Holloway, late opening the store on 11/6/26", heading);
        expect(POLICY(content), `the Policy line (heading ${heading}):\n${content}`).toMatch(/Late Opening/);
      }
    },
  },
];
