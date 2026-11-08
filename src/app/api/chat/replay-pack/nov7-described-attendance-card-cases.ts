import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * AN ATTENDANCE ACCOUNT CITES ATTENDANCE ON THE CARD (Pau-approved 7 Nov 2026, option A)
 * ============================================================================
 *
 * QA's read-only finding (g), 7 Nov 2026: with no policy named, "create verbal ca for <name> for opening store late
 * on 10-1-26 …" got a Corrective Action card with no Policy line, though the app reads the account as attendance
 * (`describedAttendanceKeys`). The live tester's "my team member <name> was late on 10-20-26, verbal ca" (with
 * LEVEL_ENDS_REQUEST) and an absence the same. DESCRIBED_ATTENDANCE_CARD_ENABLED (`ai/form-proposal.ts`).
 * The employee is invented.
 */

const WRENNA: DirectoryRow = {
  id: "e-wrenna-calloway-attendance",
  firstName: "Wrenna",
  lastName: "Calloway",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

async function citesAttendance(t: ReplayContext, said: string): Promise<void> {
  vi.setSystemTime(new Date("2026-11-06T18:18:00Z"));
  t.directory([...STAFF, WRENNA]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  const reply = await thread.say(said);
  expect(thread.proposal, `no Corrective Action card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa" });
  const policy = reply.content.split("\n").filter((line) => /^\*\*Policy:\*\*/.test(line)).join("\n");
  expect(policy, `the card cites no Attendance:\n${reply.content}`).toMatch(/Attendance/);
  expect(policy, "the app's reading is said as the manager's").not.toMatch(/as you said/i);
}

const FIX = ["DESCRIBED_ATTENDANCE_CARD_ENABLED"];

export const NOV7_DESCRIBED_ATTENDANCE_CARD_CASES: ReplayCase[] = [
  {
    id: "nov7-described-attendance-late-opening",
    title: "\"create verbal ca for <name> for opening store late on 10-1-26 …\" cites Attendance (Late Opening), never \"as you said\"",
    report: "QA's finding (g), 7 Nov 2026 (the manager's words, 6 Nov 2026 18:18Z)",
    status: { open: "no policy named, so the card cites none" },
    fixFlags: FIX,
    run: (t) =>
      citesAttendance(
        t,
        "create verbal ca for Wrenna Calloway for opening store late on 10-1-26. previous coaching is jba policy manual 1-1-26. payroll deduct DOES apply and state $25 will be payroll deducted",
      ),
  },
  {
    id: "nov7-described-attendance-late-verbal-ca",
    title: "\"my team member <name> was late on 10-20-26, verbal ca\" cites Attendance, never \"as you said\"",
    report: "QA, live tester, 7 Nov 2026 (the card also needs LEVEL_ENDS_REQUEST)",
    status: { open: "no card in production (LEVEL_ENDS_REQUEST off); with it, the card cites no policy" },
    fixFlags: [...FIX, "LEVEL_ENDS_REQUEST_ENABLED"],
    run: (t) => citesAttendance(t, "my team member Wrenna Calloway was late on 10-20-26, verbal ca"),
  },
  {
    id: "nov7-described-attendance-absent",
    title: "\"create a ca for <name> for being absent from her shift on 10-22-26\" cites Attendance, never \"as you said\"",
    report: "Pau's option A, 7 Nov 2026 (an absence, as QA asked)",
    status: { open: "no policy named, so the card cites none" },
    fixFlags: FIX,
    run: (t) => citesAttendance(t, "create a ca for Wrenna Calloway for being absent from her shift on 10-22-26"),
  },
];

/*
 * QA's Bubbles round-3 gate (7 Nov 2026): with DENIAL_NO_ACCOUNT on, "ca for <name> not late" asks what happened;
 * DESCRIBED_ATTENDANCE_CARD on as well drafted it as "Policy: Attendance, from what you described ("late")". A
 * denied fault is no attendance account (`describedAttendanceKeys`, forms/ca-policy.ts). The pack's invented
 * Rowan Kestrel, as in nov7-denial-no-account-cases.ts. Holds in production (both flags off: no Policy line).
 */
const DENIED: readonly (readonly [string, string])[] = [
  ["ca-for-not-late", "ca for Rowan Kestrel not late"],
  ["comma-not-late", "create a corrective action for Rowan Kestrel, not late"],
];

export const NOV7_DESCRIBED_ATTENDANCE_NOT_DENIED_CASES: ReplayCase[] = DENIED.map(([key, said]): ReplayCase => ({
  id: `nov7-described-attendance-denied-${key}`,
  title: `"${said}": with DENIAL_NO_ACCOUNT and DESCRIBED_ATTENDANCE_CARD on, the card cites no Attendance`,
  report: "QA's Bubbles round-3 gate, 7 Nov 2026: \"Policy: Attendance, from what you described (\"late\")\"",
  status: "fixed",
  fixFlags: [...FIX, "DENIAL_NO_ACCOUNT_ENABLED"],
  async run(t) {
    vi.setSystemTime(new Date("2026-11-06T15:00:00Z"));
    t.directory(STAFF);
    t.as("location_manager", WEST_DODGE);
    const thread = t.thread();
    const reply = await thread.say(said);
    const policy = reply.content.split("\n").filter((line) => /^\*\*Policy:\*\*/.test(line)).join("\n");
    expect(policy, `a denied fault is cited as Attendance:\n${reply.content}`).not.toMatch(/Attendance/);
    expect(reply.content, `a denied fault is drafted as described:\n${reply.content}`).not.toMatch(/from what you described \("late"\)/i);
  },
}));
