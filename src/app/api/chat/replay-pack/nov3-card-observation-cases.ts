import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/** QA's live check in the sibling app, 3 Nov 2026 (08:03 UTC); holds here, kept so it stays that way. */
export const NOV3_CARD_OBSERVATION_CASES: readonly ReplayCase[] = [
  {
    id: "nov3-card-observation-own-request",
    title: "a new request's card reads back only that request as the Observation, not the earlier incident",
    report:
      'the new card for "make me a CA for <name> for being late to opening this morning" read "Observation of Offense: …rugs untl 12;30pm <name> for being late to opening this morning" (QA live check)',
    status: "fixed",
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("a CA");
      await thread.say("Rowan Kestrel failed to take trash out and put rugs out untl 12;30pm");
      t.draftWrites({ observation: "Rowan did not take the trash out or put the rugs out until 12:30pm." });
      await thread.create();
      const card = await thread.say("make me a CA for Rowan Kestrel for being late to opening this morning");
      expect(card.formProposal, "no card of its own").toMatchObject({ templateKey: "dpoa", employeeName: "Rowan Kestrel" });
      const observation = /\*\*(?:Observation of Offense|Issue):\*\*([^\n]*)/.exec(card.content)?.[1] ?? "";
      expect(observation, "the card reads back the earlier incident").not.toMatch(/trash|rugs/i);
    },
  },
];
