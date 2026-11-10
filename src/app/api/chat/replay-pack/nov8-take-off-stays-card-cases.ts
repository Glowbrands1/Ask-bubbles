import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * TAKE_OFF_STAYS_CARD_ENABLED's guards (QA, 8 Nov 2026, relayed by coding 5). The two take-off cases themselves are in
 * `nov8-proposal-policy-set-aside-cases.ts`. Here: a real question about the policy, asked with the card open, is
 * still answered, never read as a take-off. The person is invented (the pack's STAFF).
 */
const COACHING_REQUEST = "create a coaching form for marnie holloway, she was 30 minutes late to her shift on 10/31. cite the attendance policy";

async function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-06T15:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  await thread.say(COACHING_REQUEST);
  expect(thread.proposal, "no Coaching card for Marnie Holloway").toMatchObject({ templateKey: "coaching", employeeName: "Marnie Holloway" });
  return thread;
}

export const NOV8_TAKE_OFF_STAYS_CARD_CASES: ReplayCase[] = [
  {
    id: "nov8-take-off-stays-card-question-still-answered",
    title: "card open: \"what policy does being late fall under?\" is still answered as a question, never a take-off",
    report: "QA, 8 Nov 2026: TAKE_OFF_STAYS_CARD's guard (a question is never a take-off)",
    status: "fixed",
    fixFlags: ["PROPOSAL_POLICY_SET_ASIDE_ENABLED", "TAKE_OFF_STAYS_CARD_ENABLED"],
    async run(t) {
      const thread = await start(t);
      const reply = await thread.say("what policy does being late fall under?");
      expect(reply.content, `the question was not answered:\n${reply.content}`).toMatch(/grounded answer/i);
      expect(reply.content, "a question read as a take-off").not.toMatch(/took the (?:attendance )?policy off/i);
    },
  },
];
