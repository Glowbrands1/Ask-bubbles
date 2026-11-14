import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { patch } from "./nov7-step-b-refusals-scenarios";

/**
 * ============================================================================
 * A TYPO OR DATE FIX IS NOT A NEW ACCOUNT (ACCOUNT_REPLACED_CLOSE_SENTENCE_KEPT_ENABLED)
 * ============================================================================
 *
 * QA, 13 Nov 2026, follow-up to ACCOUNT_CHANGE_REDERIVES_POLICY: "accountReplaced() counts a close sentence as kept, so
 * small date or typo edits do not re-derive." With that flag on, an Observation edit whose old sentence is not still
 * there word for word reads as a new account, so a one-letter fix re-derives the policy: a Corrective Action drafted on
 * the Attendance policy, with an Observation about cell phone use, moves to Cell Phone when "shfit" becomes "shift" (the
 * saved Observation says "the cell phone" where the manager retypes "her cell phone"). On: the
 * fixed sentence is the same sentence and the policy stays. An account that really changed still re-derives (the
 * second case). ACCOUNT_CHANGE_REDERIVES_POLICY is on in production since 17x (13 Nov 2026), so the typo case is open
 * in production. The person is invented (on no directory).
 *
 * WHAT THIS REPLAY SHOWS, AND DOES NOT: the edit's reading is scripted (the manager's own corrected sentence). A date
 * said in the edit goes through the date path, which moves the Observation's date without this step; the date arm of
 * the close-sentence rule is covered by `forms/close-sentence.test.ts`.
 */

const NELL: DirectoryRow = { id: "e-nell-orrin-arc", firstName: "Nell", lastName: "Orrin", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const REQUEST = "create ca form for nell orrin for violating the attendance policy, she was late on 10/20/26 because she was on her phone. verbal. no payroll deduct.";
const TYPO_FIX = "change the observation to: Nell Orrin was on her cell phone the whole shift.";
const NEW_ACCOUNT = "change the observation to: Nell Orrin was rude to a customer at the register.";
const REPORT = "QA, 13 Nov 2026 (follow-up to ACCOUNT_CHANGE_REDERIVES_POLICY): \"accountReplaced() counts a close sentence as kept, so small date or typo edits do not re-derive\"";
const FLAG = "ACCOUNT_REPLACED_CLOSE_SENTENCE_KEPT_ENABLED";

async function attendanceCa(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-10-25T15:00:00Z"));
  t.directory([...STAFF, NELL]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  await thread.say(REQUEST);
  t.draftWrites({ observation: "Observed:\nNell Orrin was on her cell phone the whole shfit." });
  const id = await thread.create();
  expect(t.checked(id).offense_type ?? [], "the draft is not on Attendance").toContain("attendance_policy");
  return { thread, id };
}

async function typoFix(t: ReplayContext) {
    const { thread, id } = await attendanceCa(t);
    const before = { ...t.values(id) };
    t.patchReads!({
      [TYPO_FIX]: patch("this_form", [{ field: "observation", value: "Observed:\nNell Orrin was on her cell phone the whole shift.", how: "replace", evidence: "Nell Orrin was on her cell phone the whole shift" }]),
    });
    const reply = await thread.say(TYPO_FIX);
    expect(t.values(id).observation ?? "", "the typo fix was not saved").toMatch(/the whole shift\./);
    expect(t.checked(id).offense_type ?? [], `a typo fix moved the offense:\n${reply.content}`).toEqual(["attendance_policy"]);
    for (const key of ["policy_violated", "policy_language", "action_plan"]) {
      expect(t.values(id)[key] ?? "", `a typo fix moved ${key}:\n${reply.content}`).toBe(before[key] ?? "");
    }
}

export const NOV13_ACCOUNT_REPLACED_CLOSE_SENTENCE_CASES: ReplayCase[] = [
  {
    id: "nov13-account-replaced-close-sentence-typo-keeps-policy",
    title: `"${REQUEST}" then "${TYPO_FIX}" (a one-letter fix): the Attendance policy, its lines and plan stay`,
    report: REPORT,
    // ACCOUNT_CHANGE_REDERIVES_POLICY is on in production (QA, 17x, 13 Nov 2026): the typo fix moves the policy there.
    status: { open: "the typo fix re-derives the policy: Attendance moves to Cell Phone" },
    fixFlags: [FLAG],
    run: typoFix,
  },
  {
    id: "nov13-account-replaced-close-sentence-new-account-still-rederives",
    title: `"${REQUEST}" then "${NEW_ACCOUNT}": a changed account still leaves Attendance with both flags on`,
    report: `${REPORT}; negative (a real account change still re-derives)`,
    // Changed on purpose (QA, 17x, 13 Nov 2026): ACCOUNT_CHANGE_REDERIVES_POLICY is on in production. Was OPEN.
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      const { thread, id } = await attendanceCa(t);
      t.patchReads!({
        [NEW_ACCOUNT]: patch("this_form", [{ field: "observation", value: "Observed:\nNell Orrin was rude to a customer at the register.", how: "replace", evidence: "Nell Orrin was rude to a customer at the register" }]),
      });
      await thread.say(NEW_ACCOUNT);
      expect(t.checked(id).offense_type ?? [], "a changed account kept Attendance").not.toContain("attendance_policy");
    },
  },
];
