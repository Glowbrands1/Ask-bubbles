import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * ATTENDANCE BESIDE A CLEANING DUTY NEEDS A LATENESS OR ABSENCE WORD (OTHER_BESIDE_NEEDS_LATENESS_ENABLED)
 * ============================================================================
 *
 * Parity with the sibling app's #971 (QA, 14 Nov 2026: "add OTHER_BESIDE_NEEDS_LATENESS to Bubbles as its own default-off
 * flag, with the s2a wording plus a no-lateness attendance wording as asserts"). There, Gate-Sunny-3's s2a wording
 * "Write me a CA for <R> for failing to complete opening duties. <R> did not complete daily cleaning duties." became
 * Attendance and Other: the opening duties read as attendance beside the cleaning duty (QA's ruling (b)). In this app
 * that wording is already Other alone (QA's 17z live check); a wording with opening work and no lateness ("she did not
 * finish opening the store and did not do the sanitation") is not: the card says Late Opening and Attendance + Other are
 * ticked. On: duties words are no offense, and attendance beside a cleaning duty needs a lateness or absence word. A
 * lateness beside the cleaning duty still ticks both. The person is invented (on no directory).
 */

const PIA: DirectoryRow = { id: "e-pia-wexcombe-obn", firstName: "Pia", lastName: "Wexcombe", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const S2A = "Write me a CA for Pia Wexcombe for failing to complete opening duties. Pia Wexcombe did not complete daily cleaning duties. on november 2, 2026";
const NO_LATENESS = "create a ca for Pia Wexcombe, she did not finish opening the store and did not do the sanitation. verbal. no payroll deduct.";
const LATE = "create a ca for Pia Wexcombe, she was late on 11/3/26 and did not do the sanitation. verbal. no payroll deduct.";
const REPORT = "QA, 14 Nov 2026 (parity with the sibling app's #971, Gate-Sunny-3's s2a wording): attendance beside a cleaning duty needs a lateness or absence word";
const FLAG = "OTHER_BESIDE_NEEDS_LATENESS_ENABLED";

async function create(t: ReplayContext, request: string) {
  vi.setSystemTime(new Date("2026-11-10T15:00:00Z"));
  t.directory([...STAFF, PIA]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  const card = (await thread.say(request)).content;
  t.draftWrites({ observation: `Observed:\n${request}` });
  const id = await thread.create();
  return { id, card, where: JSON.stringify({ offense: t.checked(id).offense_type, violated: t.values(id).policy_violated, plan: t.values(id).action_plan }) };
}

function otherAlone(t: ReplayContext, run: Awaited<ReturnType<typeof create>>) {
  const { id, card, where } = run;
  expect(card, `the card does not say Other:\n${card}`).toMatch(/\*\*Policy:\*\* Other/);
  expect(card, `the card reads the duties as attendance:\n${card}`).not.toMatch(/\*\*Policy:\*\*[^\n]*(?:Attendance|Late Opening)/);
  expect(t.checked(id).offense_type ?? [], `the duties became a second offense ${where}`).toEqual(["other"]);
  expect(t.values(id).policy_violated ?? "", `Policy Violated is not Other ${where}`).toMatch(/^Other$/);
  expect(t.values(id).action_plan ?? "", `the plan is not the applicable-policy plan ${where}`).toMatch(/applicable company policy/i);
}

export const NOV14_OTHER_BESIDE_NEEDS_LATENESS_CASES: ReplayCase[] = [
  {
    id: "nov14-other-beside-needs-lateness-s2a-opening-duties",
    title: `"${S2A}": opening duties beside a cleaning duty stay Other alone`,
    report: REPORT,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      otherAlone(t, await create(t, S2A));
    },
  },
  {
    id: "nov14-other-beside-needs-lateness-no-lateness-word",
    title: `"${NO_LATENESS}": opening work with no lateness word beside a cleaning duty is Other alone, not Late Opening`,
    report: `${REPORT}; a no-lateness attendance wording`,
    status: { open: "the card says Late Opening and the draft ticks Attendance and Other" },
    fixFlags: [FLAG],
    async run(t) {
      otherAlone(t, await create(t, NO_LATENESS));
    },
  },
  {
    id: "nov14-other-beside-needs-lateness-late-still-both",
    title: `"${LATE}": a lateness beside the cleaning duty still ticks Attendance and Other`,
    report: `${REPORT}; negative`,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      const { id, card, where } = await create(t, LATE);
      expect(card, `the card dropped Attendance:\n${card}`).toMatch(/\*\*Policy:\*\*[^\n]*Attendance/);
      expect(t.checked(id).offense_type ?? [], `Attendance is not ticked ${where}`).toContain("attendance_policy");
      expect(t.checked(id).offense_type ?? [], `Other is not ticked ${where}`).toContain("other");
    },
  },
];
