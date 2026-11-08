import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * THE COACHING CARD NEVER SHOWED A POLICY LINE (QA, LIVE, 8 Nov 2026)
 * ============================================================================
 *
 * QA's live test on Ask Bubbles production (e7a7ba9c; the person is the pack's invented Marnie Holloway): "my employee
 * <A> was late on 10-20-26, create a coaching form" gave a Coaching card with no policy line; the sibling app's card
 * cites "Attendance Policy, JBA Policy Manual p.14". COACHING_CARD_POLICY_ENABLED (`forms/coaching-card-policy.ts`,
 * `ai/coaching-card-policy-answer.ts`).
 */

const SAID = "my employee marnie holloway was late on 10-20-26, create a coaching form";
const FIX = ["COACHING_CARD_POLICY_ENABLED"];

export const NOV8_COACHING_CARD_POLICY_CASES: ReplayCase[] = [
  {
    id: "nov8-coaching-card-policy",
    title: "\"my employee <A> was late on 10-20-26, create a coaching form\": the Coaching card cites Attendance with its page",
    report: "QA's live test, Ask Bubbles production, 8 Nov 2026: the Coaching card has no policy line",
    status: { open: "the Coaching card has no policy line" },
    fixFlags: FIX,
    // Changed on purpose (coding 2, 8 Nov 2026): `ai/server-ask.ts` now calls withCoachingCardPolicyOnAnswer on the
    // forms path's proposal, so the case holds with its flag and `fixStatus` is gone.
    async run(t) {
      vi.setSystemTime(new Date("2026-11-07T15:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say(SAID);
      expect(thread.proposal?.templateKey, "a Coaching card").toBe("coaching");
      expect(reply.content, `no policy line on the Coaching card:\n${reply.content}`).toMatch(/Attendance Policy, JBA Policy Manual p\.\d+/);
    },
  },
];
