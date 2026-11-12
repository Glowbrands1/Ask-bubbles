import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, onStoryClock } from "./cases";

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
      // Changed on purpose (QA's round-6 gate, 8 Nov 2026): with PROPOSAL_NAME_CORRECTION_ENABLED (#573) on too, the
      // kept card is led by its one notice, '"Remy Caldre" isn't a name on the roster, so the card is for **Remy
      // Calder**. …' — the card itself is unchanged. That line is allowed ahead of the card; nothing else is.
      const card = reply.content.replace(/^"Remy Caldre" isn't a name on the roster, so the card is for \*\*Remy Calder\*\*\. Tell me if it's someone else\.\n\n/, "");
      expect(card, `the card was replaced by the bare question:\n${reply.content}`).toMatch(/^I'll draft a \*\*Corrective Action Form\*\* for \*\*Remy Calder\*\*/);
      expect(reply.content, `the bare question is asked:\n${reply.content}`).not.toMatch(/Is this for \*\*Remy Calder\*\*\?/);
      expect(reply.formProposal?.employeeName ?? null).toBe("Remy Calder");
    },
  },
];

// Gate-Bubbles-5 (G5-743): these cases tell a story dated after the pack's 10/26/2026; they run on a day after it.
onStoryClock(NOV8_NEAR_MISS_CARD_KEPT_CASES);
