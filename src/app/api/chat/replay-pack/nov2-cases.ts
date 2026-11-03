import { expect } from "vitest";

import { noRepeatedReply, STAFF, TWO_STORES, WEST_DODGE, type ReplayAnswer, type ReplayCase } from "./cases";

/** The overnight scan of 2 Nov 2026 (QA, 3 Nov), as it applies to this app. */
export const NOV2_CASES: readonly ReplayCase[] = [
  {
    id: "nov2-west-dodge-whole-team",
    title: "a coaching form for all team members, six turns: never the same refusal again",
    report:
      '"earlier bubbles made a coaching form for all team members. Now it is struggling to do that, it says it cannot make a coaching form for all team members, but it just did it for me earlier" (1 star)',
    // WHOLE_TEAM_COACHING_ENABLED (#357) is on in production (QA, 3 Nov 2026) and the refusal
    // is gone. Asked twice before naming a store, the team card asks "Which store is this
    // about?" twice, word for word; every other turn now differs.
    // Fixed in production: SAME_ASK_NO_REPEAT on (QA, 3 Nov 2026, 12:05 UTC; live-checked).
    status: "fixed",
    fixFlags: ["SAME_ASK_NO_REPEAT_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", TWO_STORES);
      const thread = t.thread();
      const replies: ReplayAnswer[] = [];
      for (const turn of [
        "coaching form for all team members",
        "make a coaching form for all team members",
        "dodge",
        "make a coaching form for all team members at dodge",
        "earlier you made a caoching form for all team members for me",
        "dodge",
      ]) {
        replies.push(await thread.say(turn));
      }
      noRepeatedReply(replies);
      for (const reply of replies) expect(reply.content).not.toMatch(/won't make one card for the whole staff/);
      expect(replies.map((reply) => reply.content).join("\n")).not.toContain("Dodge Account");
    },
  },
  {
    id: "nov2-p4-question-to-card",
    title: "a question about the card gets an answer, not the same card again",
    report:
      '"When a manager asked the bot something, it sent the same card again without answering and pasted her question into the Observation field. A CA got the same card 4 times" (the sibling app)',
    // Holds here with production's flags (replayed 3 Nov 2026); open in the sibling app.
    status: "fixed",
    fixFlags: ["QUESTION_NOT_FORM_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("MAKE ME a CA for rowan. she was tardy this morning");
      if (!thread.proposal) await thread.say("yes");
      expect(thread.proposal?.templateKey).toBeTruthy();
      for (const turn of ["what policy was violayted", "what do i put in policy violated", "what exatly do i put in the policy tab", "what is direct policy from manual"]) {
        const before = t.calls().chat;
        const reply = await thread.say(turn);
        expect(reply.formProposal, `"${turn}" got the card back`).toBeUndefined();
        expect(t.calls().chat, `"${turn}" was not answered`).toBeGreaterThan(before);
      }
    },
  },
];
