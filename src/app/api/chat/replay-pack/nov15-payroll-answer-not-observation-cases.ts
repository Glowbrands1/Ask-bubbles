import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * From the sibling app (QA, batch J, 15 Nov 2026; a regression case only, this app reads it right): its card wrote "she was 20 minutes late on 11/9/26 yes
 * payroll but I don't know the amount" as the Observation. The payroll answer is never account text. People are STAFF's
 * invented ones.
 */
function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-11T16:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV15_PAYROLL_ANSWER_NOT_OBSERVATION_CASES: ReplayCase[] = [
  {
    id: "nov15-payroll-answer-not-observation",
    title: "the payroll answer \"yes payroll but I don't know the amount\" is never written into the card's Observation",
    report: "QA, 15 Nov 2026 (the sibling app's batch J): a payroll answer is never account text, in both apps",
    status: "fixed",
    async run(t) {
      const thread = start(t);
      await thread.say("verbal ca for remy calder, she was 20 minutes late on 11/9/26");
      for (const answer of ["yes payroll but I don't know the amount", "yes payroll"]) {
        const reply = await thread.say(answer);
        // This app's card shows the account as its **Issue:** line (the sibling app's, "Observation of Offense").
        const issue = /\*\*(?:Issue|Observation of Offense):\*\*([^\n·]*)/.exec(reply.content)?.[1] ?? "";
        expect(issue, "the card shows no account line").toMatch(/20 minutes late on 11\/9\/26/);
        expect(issue, `"${answer}" was written into the card's account line`).not.toMatch(/payroll|know the amount/i);
        expect((thread.proposal as { issue?: string | null } | undefined)?.issue ?? "", `"${answer}" is in the card's account`).not.toMatch(/payroll|know the amount/i);
      }
    },
  },
];
