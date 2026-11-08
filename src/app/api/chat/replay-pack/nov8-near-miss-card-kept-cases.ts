import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * NEAR_MISS_QUESTION_RULES_ENABLED (ported from the sibling app: QA's round-4 gate there, 8 Nov 2026, nov5-r6 turn 7
 * "make that change to <a typo of the card's employee>"): with the name set on, the card on screen was replaced by
 * the bare "Is this for **<roster name>**?". A card on screen is never replaced by the question: a near-miss of its own
 * employee is her. The sibling's chat, in this app's words; the person is the pack's invented Remy Calder.
 */
const NAME_SET = [
  "FORM_NAME_FROM_ROSTER_ENABLED",
  "ROSTER_NEAR_MISS_ENABLED",
  "ROSTER_COMPOUND_SURNAME_ENABLED",
  "NEAR_MISS_DETAILS_ACCEPT_ENABLED",
];
const RULES = "NEAR_MISS_QUESTION_RULES_ENABLED";

export const NOV8_NEAR_MISS_CARD_KEPT_CASES: ReplayCase[] = [
  {
    id: "nov8-near-miss-card-kept-make-that-change",
    title: "with the name set on: a card for Remy Calder, then \"make that change to Remy Caldre\": the card stays, for Remy Calder, never the bare question",
    report: "The sibling app's round-4 gate (QA, 8 Nov 2026): a card that already exists was replaced by a bare \"Is this for X?\"",
    status: { open: "with the name set on, the card is replaced by \"Is this for **Remy Calder**?\"" },
    fixFlags: [...NAME_SET, RULES],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const first = await thread.say("create a corrective action for Remy Calder, he was rude to a guest at the register on 11/2");
      expect(first.formProposal?.employeeName ?? null, `no card for Remy Calder (the premise):\n${first.content}`).toBe("Remy Calder");
      const reply = await thread.say("make that change to Remy Caldre");
      expect(reply.content, `the card was replaced by the bare question:\n${reply.content}`).toMatch(/^I'll draft a \*\*Corrective Action Form\*\* for \*\*Remy Calder\*\*/);
      expect(reply.formProposal?.employeeName ?? null).toBe("Remy Calder");
    },
  },
];
