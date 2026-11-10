import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * The sibling app's live check after its round 4 (QA, 8 Nov 2026, its conv ef902fec): "Coaching form for <A>. Also a
 * CA for <B>." made the Coaching card for A and still asked "Which of them is this **Coaching Form** for — **<A>** or
 * **<B>**?" above it. A GUARD here: this app makes one card per request (nov7-two-forms-each-person), and with both
 * people off the roster, as in that chat, no card that names its employee is asked which. The tester's wording and
 * the tester's own invented names (on neither app's directory).
 */
export const NOV8_TWO_FORMS_CARD_NOT_ASKED_CASES: ReplayCase[] = [
  {
    id: "nov8-two-forms-card-not-asked-ef902fec",
    title: "guard: \"Coaching form for <A>. Also a CA for <B>.\" (both off the roster): no card that names its employee is asked \"Which of them\"",
    report: "QA, 8 Nov 2026 (the sibling app's conv ef902fec): the card was for A, and the reply still asked \"Which of them … — A or B?\"",
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-08T01:05:10Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("Coaching form for Dana Lane. Also a CA for Marnie Quill.");
      const cards = [thread.proposal, ...((reply as { formProposals?: unknown[] }).formProposals ?? [])].filter(Boolean) as { employeeName?: string | null }[];
      for (const card of cards) {
        if (!card.employeeName) continue;
        expect(reply.content, `a card for ${card.employeeName} is asked which:\n${reply.content}`).not.toMatch(
          new RegExp(`Which of them is this \\*\\*[^*]+\\*\\* for — [^\\n]*\\*\\*${card.employeeName}\\*\\*`),
        );
      }
    },
  },
];
