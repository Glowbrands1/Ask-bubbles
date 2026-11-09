import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * A SHIFT NOT SHOWN UP TO CITES ATTENDANCE (QA, the Bubbles round-7 live test, 9 Nov 2026; MISSED_SHIFT_CITES_ATTENDANCE)
 * ============================================================================
 *
 * "make me CA for <first name> failing to complete shifts", then "Make me a CA for <full name> not showing up to her
 * shifts on 11/7 and 11/8" (and the single request "create a CA for <A>, not showing up to her shifts on 11/7 and
 * 11/8"): the card kept the dates but had no "Policy:" line, its Action plan on "the applicable company policy". The
 * sibling app's live card: "Policy: Attendance — read from this request". QA's wording; the pack's invented person.
 */
const FIX = ["MISSED_SHIFT_CITES_ATTENDANCE_ENABLED"];
const REPORT = "QA, the Bubbles round-7 live test (9 Nov 2026): missed shifts gave a card with no Policy line";
const POLICY = /^\*\*Policy:\*\* Attendance\b/m;

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-09T16:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

const reported = ([
  ["single", "the single request", ["create a CA for Marnie Holloway, not showing up to her shifts on 11/7 and 11/8"]],
  ["after-first-name", "after \"make me CA for <first name> failing to complete shifts\"", ["make me CA for marnie failing to complete shifts", "Make me a CA for Marnie Holloway not showing up to her shifts on 11/7 and 11/8"]],
] as const).map(([key, what, turns]): ReplayCase => ({
  id: `nov9-missed-shift-cites-attendance-${key}`,
  title: `${what}: "… not showing up to her shifts on 11/7 and 11/8" cites Attendance`,
  report: REPORT,
  status: { open: "no Policy line; the Action plan on \"the applicable company policy\"" },
  fixFlags: FIX,
  async run(t) {
    const thread = start(t);
    let content = "";
    for (const turn of turns) content = (await thread.say(turn)).content;
    expect(thread.proposal?.employeeName ?? null, `the card is not for Marnie:\n${content}`).toBe("Marnie Holloway");
    expect(content, `no Attendance Policy line:\n${content}`).toMatch(POLICY);
    expect(content, `the Action plan is still on "the applicable company policy":\n${content}`).not.toMatch(/applicable company policy with/i);
  },
}));

export const NOV9_MISSED_SHIFT_POLICY_CASES: ReplayCase[] = [
  ...reported,
  {
    id: "nov9-missed-shift-cites-attendance-late-unchanged",
    title: "must not change: \"she was late on 11/7\" keeps its Attendance line from the manual's words",
    report: REPORT,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const { content } = await thread.say("create a CA for Marnie Holloway, she was late on 11/7");
      expect(content).toMatch(/^\*\*Policy:\*\* Attendance, from what you described/m);
    },
  },
  {
    id: "nov9-missed-shift-cites-attendance-named-policy-wins",
    title: "must not change: a policy the manager names (\"… missed her shift, under the dress code policy\") is the one cited",
    report: REPORT,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const { content } = await thread.say("create a CA for Marnie Holloway, she missed her shift on 11/7 and wore leggings, cite the dress code policy");
      expect(content).not.toMatch(/Attendance — read from this request/);
    },
  },
];
