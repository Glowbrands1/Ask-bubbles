import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { patch } from "./nov7-step-b-refusals-scenarios";

/**
 * ============================================================================
 * THE EDIT'S REPLY NAMES A TICKED BOX BY ITS LABEL, NEVER ITS KEY (DIFF_REPLY_OPTION_LABELS_ENABLED)
 * ============================================================================
 *
 * v2-Gate-Sunny-2's nit on the S#942 gate (14 Nov 2026) and QA: Bubbles production has shown it to managers since 17y.
 * An edit that replaces a lateness account with phone use re-derives the offense (ACCOUNT_CHANGE_REDERIVES_POLICY, on
 * in production), and the reply from the saved diff read `Changed Type of Offense to "standards_of_conduct"`. The person
 * is invented (on no directory).
 */

const ODILE: DirectoryRow = { id: "e-odile-brannagh-drol", firstName: "Odile", lastName: "Brannagh", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const LATE = "create ca form for odile brannagh for violating attendance policy, she was late on 10/20/26. verbal. no payroll deduct.";
const PHONE = "change the issue to she was on her phone the whole shift";
const FLAG = "DIFF_REPLY_OPTION_LABELS_ENABLED";

async function lateCa(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-10-25T15:00:00Z"));
  t.directory([...STAFF, ODILE]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  await thread.say(LATE);
  t.draftWrites({ observation: "Observed:\nOdile Brannagh was late on October 20, 2026." });
  const id = await thread.create();
  return { thread, id };
}

export const NOV14_DIFF_REPLY_OPTION_LABELS_CASES: ReplayCase[] = [
  {
    id: "nov14-diff-reply-option-labels-offense",
    title: `"${LATE}" then "${PHONE}": the reply names the new Type of Offense by its label`,
    report: "v2-Gate-Sunny-2 / QA (14 Nov 2026): `Changed Type of Offense to \"standards_of_conduct\"` in Bubbles production since 17y",
    status: { open: "the reply shows the option's key, \"standards_of_conduct\"" },
    fixFlags: [FLAG],
    async run(t) {
      const { thread, id } = await lateCa(t);
      t.patchReads!({
        [PHONE]: patch("this_form", [{ field: "observation", value: "Observed:\nShe was on her phone the whole shift.", how: "replace", evidence: "she was on her phone the whole shift" }]),
      });
      const reply = await thread.say(PHONE);
      expect(t.checked(id).offense_type ?? [], "the offense did not move (the case's premise)").not.toContain("attendance_policy");
      expect(reply.content, "an option key in the reply").not.toMatch(/"[a-z]+(?:_[a-z]+)+"/);
      expect(reply.content, reply.content).toMatch(/Changed Type of Offense to "Standards of Conduct"/i);
    },
  },
];
