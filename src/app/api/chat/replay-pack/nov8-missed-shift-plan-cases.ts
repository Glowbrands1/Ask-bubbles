import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * A MISSED SHIFT IS NO LATENESS: THE SAVED ACTION PLAN IS THE CARD'S (the sibling app's live Create test, QA round 5, 8 Nov 2026)
 * ============================================================================
 *
 * In the sibling app's production with round 5 on, sf-s38's "make me an CA for <name> missing her saturday and sunday shifts due to
 * wanting to go home for the weekend but failed to communicate proporley" made a card whose Action Plan read
 * "Management will review the Attendance policy with <name>. Future policy violations may result …", and Create saved
 * "<name> is expected to arrive on time for all scheduled shifts moving forward … Continued lateness will result in
 * further disciplinary review …": ATTENDANCE_ACTION_PLAN's lateness plan, for shifts she never came to.
 * MISSED_SHIFT_NOT_LATENESS_ENABLED (`forms/attendance-action-plan.ts`). The manager's words; the person is invented. The same writer and flags run here (ATTENDANCE_ACTION_PLAN, MEETING_NOT_LATENESS_PLAN).
 */
const RHEA: DirectoryRow = { id: "e-rhea-calloway-s38", firstName: "Rhea", lastName: "Calloway", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const T1 =
  "make me an CA for Rhea Calloway missing her saturday and sunday shifts due to wanting to go home for the weekend but failed to communicate proporley";
const FIX = ["MISSED_SHIFT_NOT_LATENESS_ENABLED"];
const REPORT = "The sibling app's live Create test, QA round 5 (8 Nov 2026), sf-s38 T1: the saved Action Plan was the lateness plan";
const LATENESS_PLAN = /arrive on time|Continued lateness/i;

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-07T16:14:00Z"));
  t.directory([...STAFF, RHEA]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

/** The card's Action Plan line, as the reply shows it. */
const cardPlan = (content: string) => (/\*\*Action Plan:\*\*\s*([^\n]+)/i.exec(content)?.[1] ?? "").trim();

export const NOV8_MISSED_SHIFT_PLAN_CASES: ReplayCase[] = [
  {
    id: "nov8-missed-shift-plan-t1",
    title: "sf-s38 T1 \"… missing her saturday and sunday shifts … failed to communicate proporley\", then Create: the saved Action Plan is the card's, never the lateness plan",
    report: REPORT,
    // A guard here: this pack's card for T1 cites no policy (the general plan), so the attendance writer is not reached;
    // it is in the sibling app, where this case is open. The writer and its flags are the same in both apps.
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const card = await thread.say(T1);
      const shown = cardPlan(card.content);
      expect(shown, `the card shows no Action Plan:\n${card.content}`).not.toBe("");
      expect(shown, "the card's plan is the lateness plan").not.toMatch(LATENESS_PLAN);
      t.draftWrites({ observation: "Observed:\nRhea Calloway missed her Saturday and Sunday shifts and did not communicate it properly." });
      const id = await thread.create();
      const saved = t.values(id).action_plan ?? "";
      expect(saved, "the saved Action Plan is the lateness plan").not.toMatch(LATENESS_PLAN);
      expect(saved.replace(/\s+/g, " ").trim(), `the saved Action Plan is not the card's:\ncard: ${shown}\nsaved: ${saved}`).toBe(shown.replace(/\s+/g, " ").trim());
    },
  },
  {
    id: "nov8-missed-shift-plan-cites-attendance",
    title: "the same account with the Attendance policy on the card (\"… for violating the attendance policy, missing her saturday and sunday shifts …\"), then Create: the saved Action Plan is the card's, never the lateness plan",
    // QA's live Create here (8 Nov 2026) confirms it: on production the card cited Attendance p.14 and the saved
    // plan was the lateness plan. This pack's card cites Attendance when the manager names it.
    report: `${REPORT} (confirmed live here, QA, 8 Nov 2026: Policy Violated Attendance p.14, the lateness plan saved)`,
    status: { open: "the saved Action Plan is \"Rhea is expected to arrive on time for all scheduled shifts … Continued lateness …\"" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const card = await thread.say(T1.replace("missing her", "for violating the attendance policy, missing her"));
      const shown = cardPlan(card.content);
      expect(card.content, `the card does not cite Attendance:\n${card.content}`).toMatch(/\*\*Policy:\*\* Attendance/);
      t.draftWrites({ observation: "Observed:\nRhea Calloway missed her Saturday and Sunday shifts and did not communicate it properly." });
      const id = await thread.create();
      const saved = t.values(id).action_plan ?? "";
      expect(t.values(id).policy_violated ?? "", "the saved form does not cite Attendance").toMatch(/Attendance/);
      expect(saved, "the saved Action Plan is the lateness plan").not.toMatch(LATENESS_PLAN);
      // The general two-sentence plan. Here the card's plan says "the applicable company policy" while the saved one
      // names the Attendance policy it cites: a wording difference of this app's card, not this report (told to QA).
      expect(saved, `the saved Action Plan is not the general plan:\ncard: ${shown}\nsaved: ${saved}`).toMatch(
        /^Management will review the (?:Attendance|applicable company) policy with Rhea\. Future policy violations/,
      );
    },
  },
  {
    id: "nov8-missed-shift-plan-cites-attendance-late-negative",
    title: "negative: \"… for violating the attendance policy, she was 30 minutes late to her shift on 11/2\": lateness keeps the attendance plan",
    report: `${REPORT} (the condition: only an account without lateness)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say("make me an CA for Rhea Calloway for violating the attendance policy, she was 30 minutes late to her shift on 11/2");
      t.draftWrites({ observation: "Observed:\nRhea Calloway was 30 minutes late to her shift on 11/2/2026." });
      const id = await thread.create();
      expect(t.values(id).action_plan ?? "", "lateness lost its plan").toMatch(LATENESS_PLAN);
    },
  },
];
