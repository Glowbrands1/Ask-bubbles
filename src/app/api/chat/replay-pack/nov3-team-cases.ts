import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/** QA's live check of the team card in production, 3 Nov 2026. */
export const NOV3_TEAM_CASES: readonly ReplayCase[] = [
  {
    id: "nov3-team-expectation",
    title: "a team expectation with no \"coaching\" in it is the team card, not a policy answer",
    report: '"store wide everyone needs the reminder to call a manager for cash drawer shortages, overages, and returns" → a policy answer, no team card (QA live check)',
    // Fixed in production: NEW_REQUEST_OPEN_DRAFT, DRAFT_REUSE_NEW_REQUEST and TEAM_CARD_WORDING on (QA, 3 Nov 2026; live-checked 07:20 UTC).
    status: "fixed",
    fixFlags: ["TEAM_CARD_WORDING_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("store wide everyone needs the reminder to call a manager for cash drawer shortages, overages, and returns");
      expect(thread.proposal).toMatchObject({ templateKey: "coaching", subject: "team" });
    },
  },
  {
    id: "nov3-team-observation-echo",
    title: "words that only name the audience are not written into the team card",
    report: 'the team card\'s Observation read "the whole team: for the whole store" (QA live check)',
    // Fixed in production: NEW_REQUEST_OPEN_DRAFT, DRAFT_REUSE_NEW_REQUEST and TEAM_CARD_WORDING on (QA, 3 Nov 2026; live-checked 07:20 UTC).
    status: "fixed",
    fixFlags: ["TEAM_CARD_WORDING_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("Create a coaching form.");
      await thread.say("for the whole store");
      expect(thread.proposal).toMatchObject({ templateKey: "coaching", subject: "team" });
      await thread.create();
      // The drafting model was handed "WHAT THE MANAGER DESCRIBED: for the whole store" and wrote it into the card.
      const described = t.draftPrompts().map((prompt) => prompt.split("WHAT THE MANAGER DESCRIBED:")[1] ?? "");
      expect(described.join("\n")).not.toMatch(/for the whole store/i);
    },
  },
];
