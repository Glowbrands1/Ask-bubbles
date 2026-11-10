import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * "TAKE THE ATTENDANCE POLICY OFF THE FORM": THE ACTION PLAN NAMES NO POLICY THAT CAME OFF (the Bubbles live tester,
 * QA, 8 Nov 2026, round 5 on)
 * ============================================================================
 *
 * "CA for <A> she was late today", then "take the attendance policy off the form": the reply said "**Policy:** none —
 * you took the Attendance policy off", and its Action plan still said "Management will review the Attendance policy
 * with <A>". New with round 5: before it, the take-off was answered as a policy question (PROPOSAL_POLICY_SET_ASIDE
 * and TAKE_OFF_STAYS_CARD went on). POLICY_SET_ASIDE_PLAN_ENABLED (`forms/policy-set-aside.ts`). The tester's words;
 * the person is invented (the pack's Marnie Holloway).
 */
const FIX = ["POLICY_SET_ASIDE_PLAN_ENABLED"];
const REPORT = "The Bubbles live tester, QA, 8 Nov 2026 (round 5 on): \"Policy: none\" with the Action plan still on Attendance";
const plan = (content: string) => (/\*\*Action plan:\*\*\s*([^\n]+)/i.exec(content)?.[1] ?? "").trim();

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-07T15:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV8_SET_ASIDE_PLAN_CASES: ReplayCase[] = [
  {
    id: "nov8-set-aside-plan",
    title: "\"CA for <A> she was late today\", then \"take the attendance policy off the form\": the card's Action plan reviews the applicable company policy, and so does the saved form",
    report: REPORT,
    status: { open: "the card's Action plan says \"Management will review the Attendance policy with Marnie\"" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say("CA for Marnie Holloway she was late today");
      const reply = await thread.say("take the attendance policy off the form");
      expect(reply.content, `the policy did not come off:\n${reply.content}`).toMatch(/\*\*Policy:\*\* none/);
      expect(plan(reply.content), `the Action plan still reviews the policy taken off:\n${reply.content}`).not.toMatch(/attendance/i);
      expect(plan(reply.content), `the Action plan names no policy:\n${reply.content}`).toMatch(/Management will review the applicable company policy with Marnie/);
      t.draftWrites({ observation: "Observed:\nMarnie Holloway was late to her shift today." });
      const id = await thread.create();
      expect(t.values(id).action_plan ?? "", "the saved Action Plan reviews the Attendance policy").not.toMatch(/attendance/i);
    },
  },
  {
    id: "nov8-set-aside-plan-other-policy",
    title: "negative: \"take the dress code policy off the form\" (not on the card): the Action plan still reviews Attendance",
    report: `${REPORT} (the condition: only a policy taken off leaves the plan)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say("CA for Marnie Holloway she was late today");
      const reply = await thread.say("take the dress code policy off the form");
      const line = plan(reply.content);
      if (line) expect(line, `the plan lost a policy nobody took off:\n${reply.content}`).toMatch(/Attendance/);
    },
  },
];
