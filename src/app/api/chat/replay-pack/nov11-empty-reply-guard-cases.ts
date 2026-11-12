import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A TURN NEVER SHOWS A BLANK ANSWER (port from the sibling app, PR #141; QA's stale-PR cleanup, 11 Nov 2026;
 * EMPTY_REPLY_GUARD_ENABLED)
 * ============================================================================
 *
 * The sibling app's QA found 11 empty assistant turns stored as content "". An answer whose prose is empty after the
 * model and every post-processor, with no card, choice, opened form or update, reached the manager as an empty bubble
 * and was saved as a blank assistant row. The model's empty answer is scripted: the live model cannot return one
 * (an empty stream is already `model_failed`), but the passes after it can leave nothing.
 *
 * Invariant: the manager sees either an answer or an honest failure, never a 200 with nothing in it.
 */
export const NOV11_EMPTY_REPLY_GUARD_CASES: ReplayCase[] = [
  {
    id: "nov11-empty-reply-guard-policy-question",
    title: "a policy question whose answer comes back with no prose and no card: an honest failure, never an empty bubble",
    report:
      "QA, sibling app (ported in PR #141, 25 Oct 2026): 11 empty assistant turns, each a failed turn stored as content \"\"; \"a turn never saves or shows an empty assistant reply\"",
    status: { open: "the reply is a 200 with content \"\" and no card: an empty bubble" },
    fixFlags: ["EMPTY_REPLY_GUARD_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      t.modelSays("");
      const thread = t.thread();
      let reply: { content: string } | null = null;
      let failure = "";
      try {
        reply = await thread.say("What is the dress code policy?");
      } catch (error) {
        failure = String((error as Error)?.message ?? error);
      }
      if (reply) {
        expect(reply.content.trim(), "a 200 with an empty answer: the manager sees a blank bubble").not.toBe("");
      } else {
        expect(failure, `the turn failed, but not as the honest empty-reply failure:\n${failure}`).toMatch(/did not write an answer/i);
      }
    },
  },
];
