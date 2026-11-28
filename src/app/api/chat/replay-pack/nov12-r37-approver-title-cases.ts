import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * "ONCE THE DM APPROVES" IS NOT THE EMPLOYEE'S TITLE (QA's r37 live check in the sibling app, 12 Nov 2026; ported;
 * APPROVER_TITLE_NOT_EMPLOYEE_ENABLED)
 * ============================================================================
 *
 * QA's wording, the person invented (on the roster, no Woven position): "CA for <A>, probably termination once the DM
 * approves" put District Manager on the card here as "the one you gave".
 */
const ODALYS: DirectoryRow = { id: "e-r37-odalys-pemberley", firstName: "Odalys", lastName: "Pemberley", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: null as unknown as string };
const FIX = ["APPROVER_TITLE_NOT_EMPLOYEE_ENABLED"];

export const NOV12_R37_APPROVER_TITLE_CASES: ReplayCase[] = [
  {
    id: "nov12-r37-dm-approves-not-the-title",
    title: "\"CA for <A>, probably termination once the DM approves\": the card's title is never District Manager",
    report: "QA's r37 live check in the sibling app (12 Nov 2026), ported: \"once the DM approves\" put District Manager on the card",
    status: { open: "the card's title is District Manager, \"the one you gave\"" },
    fixFlags: FIX,
    async run(t) {
      vi.setSystemTime(new Date("2026-11-12T16:00:00Z"));
      t.directory([...STAFF, ODALYS]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("CA for Odalys Pemberley, probably termination once the DM approves");
      expect(thread.proposal?.employeeName ?? null, reply.content).toBe("Odalys Pemberley");
      expect(thread.proposal?.employeeRole ?? null, reply.content).not.toBe("District Manager");
      expect(reply.content, reply.content).not.toMatch(/District Manager/);
    },
  },
  {
    id: "nov12-r37-stated-title-kept",
    title: "\"CA for <A>, she is a district manager, she missed the meeting\": the title the manager stated for her stays",
    report: "Guard for QA's r37 live check in the sibling app (12 Nov 2026), ported",
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      vi.setSystemTime(new Date("2026-11-12T16:00:00Z"));
      t.directory([...STAFF, ODALYS]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("CA for Odalys Pemberley, she is a district manager, she missed the meeting");
      expect(thread.proposal?.employeeRole ?? null, reply.content).toBe("District Manager");
    },
  },
];
