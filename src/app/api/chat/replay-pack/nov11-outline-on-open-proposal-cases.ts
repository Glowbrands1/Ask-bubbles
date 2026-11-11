import { expect } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * AN OUTLINE PASTED ON AN OPEN PROPOSAL NEVER COSTS THE PROPOSAL ITS FACTS (QA's Bubbles 17i live test, 11 Nov 2026)
 * ============================================================================
 *
 * Admin, Create never pressed: (a) "create a corrective action for <A>, she was late on 11/3/26" → the card (Issue,
 * Attendance p.14); (b) an Observation / Action Plan outline written for another person → ignored; (c) "same outline but
 * with <A first>'s info" → no Issue, no Policy, a generic plan (live). In the pack, (c)'s Issue takes the outline's date.
 * OUTLINE_ON_OPEN_PROPOSAL_ENABLED. The tester's turns; the people are invented (B is on no roster).
 */
const FLAG = "OUTLINE_ON_OPEN_PROPOSAL_ENABLED";
const ILSA: DirectoryRow = { id: "e-oop-ilsa-varnholt", firstName: "Ilsa", lastName: "Varnholt", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const A = "create a corrective action for Ilsa Varnholt, she was late on 11/3/26";
const OUTLINE =
  "Observation of Offense: Corisande Velt arrived 20 minutes late to her opening shift on 10/12/26 and did not call the manager on duty.\nAction Plan: The Leadership Team will coach Corisande on the Attendance policy and review call-in expectations. Further late arrivals may result in additional corrective action up to and including termination.";
const C = "same outline but with Ilsa's info";

function start(t: ReplayContext) {
  t.directory([...STAFF, ILSA]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

function keepsStepA(reply: { content: string }, card: Record<string, unknown> | null, step: string) {
  expect(card, `${step}: no card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Ilsa Varnholt" });
  expect(String(card?.issue ?? ""), `${step}: the Issue is not step (a)'s:\n${reply.content}`).toMatch(/late on 11\/3\/26/);
  expect(reply.content, `${step}: the outline's person or date is on the card:\n${reply.content}`).not.toMatch(/Corisande|10\/12\/26/);
  expect(reply.content, `${step}: the Attendance policy is lost:\n${reply.content}`).toMatch(/\*\*Policy:\*\*[^\n]*Attendance/);
}

export const NOV11_OUTLINE_ON_OPEN_PROPOSAL_CASES: ReplayCase[] = [
  {
    id: "nov11-17i-outline-on-open-proposal",
    title: "a proposal, an outline for another person pasted, then \"same outline but with Ilsa's info\": step (a)'s Issue, date and Attendance policy are kept",
    report: "QA's Bubbles 17i live test, 11 Nov 2026 (admin; Create never pressed)",
    status: { open: "\"same outline but with Ilsa's info\" re-reads the outline as her account: the Issue takes the outline's date 10/12/26 (live: no Issue, no Policy)" },
    fixFlags: [FLAG],
    async run(t) {
      const thread = start(t);
      const a = await thread.say(A);
      keepsStepA(a, thread.proposal as Record<string, unknown> | null, "a");
      const b = await thread.say(OUTLINE);
      keepsStepA(b, thread.proposal as Record<string, unknown> | null, "b");
      const c = await thread.say(C);
      keepsStepA(c, thread.proposal as Record<string, unknown> | null, "c");
    },
  },
];
