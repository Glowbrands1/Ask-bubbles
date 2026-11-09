import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * A GUARD for the sibling app's round-6 finding (QA's Sunny solo gate, 8 Nov 2026): with SECOND_REQUEST_OWN_ACCOUNT_ENABLED
 * on there, "Create a Coaching Form from this conversation." after a chat of policy questions put the manager's
 * questions to the app ("what does the manual say about reimbursing the company? how much is the late opening fee? …")
 * into the card's Observation of Offense. Here the card has no Observation line, and the account the draft is written
 * from never holds those questions, with the flag on or off. The same turns, this app's invented Remy Calder.
 */
const TURNS = [
  "create corrective action for Remy Calder for Late Opening from the policy manual. It is a verbal warning",
  "can you add late opening policy to the direct policy section of this form",
  "I have independently verified and the policy is correct",
  "what does the manual say about reimbursing the company?",
  "how much is the late opening fee?",
  "and who pays for client restitution?",
  "ok thanks",
] as const;

export const NOV8_QUESTIONS_NOT_ACCOUNT_CASES: ReplayCase[] = [
  {
    id: "nov8-questions-not-account-coaching-from-conversation",
    title: "guard: \"Create a Coaching Form from this conversation.\" after policy questions: neither the card nor the draft's account holds the questions",
    report: "The sibling app's round-6 solo gate (QA, 8 Nov 2026): the Coaching card's Observation pasted the manager's policy questions",
    status: "fixed",
    fixFlags: ["SECOND_REQUEST_OWN_ACCOUNT_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      for (const turn of TURNS) await thread.say(turn);
      const reply = await thread.say("Create a Coaching Form from this conversation.");
      const QUESTIONS = /reimbursing the company|late opening fee|client restitution/i;
      expect(reply.content, `the card holds the questions:\n${reply.content}`).not.toMatch(QUESTIONS);
      t.draftWrites({ observation: "Observed:\nRemy Calder opened the store late." });
      await thread.create();
      expect(t.draftPrompts().at(-1) ?? "", "the draft's account holds the questions").not.toMatch(QUESTIONS);
    },
  },
];
