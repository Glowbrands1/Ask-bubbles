import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * THE CARD, CHECKED AGAINST THE MANAGER'S WORDS (CARD_CHECKED_AGAINST_WORDS_ENABLED; Pau's direction via QA, 13 Nov 2026)
 * ============================================================================
 *
 * One general check on every card before it is shown (`forms/card-checked-against-words.ts`), instead of one tidy per
 * live failure. The cases are QA's live wording; the people are invented and on no directory. The card-check model is
 * never scripted here: the code's checks and the repair from the manager's own clauses do the work, and an unscripted
 * model call falls back.
 */

const REPORT = "Pau's direction via QA, 13 Nov 2026: check the card against the manager's own words before showing it";
const FIX = ["CARD_CHECKED_AGAINST_WORDS_ENABLED"];

export const NOV13_CARD_CHECKED_AGAINST_WORDS_CASES: ReplayCase[] = [
  {
    id: "nov13-card-checked-off-roster-hedge-not-issue",
    title: "QA's 17r note, \"CA for Corwin Ashdale, do not terminate yet, she was late\" (not on the roster): the held card's Issue is the account, never the hedge",
    report: `${REPORT} (QA's 17r live note: on the off-roster ask path the card still says Issue: do not terminate yet)`,
    status: { open: "the held card's Issue is \"do not terminate yet\"" },
    fixFlags: FIX,
    async run(t) {
      vi.setSystemTime(new Date("2026-11-13T16:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("CA for Corwin Ashdale, do not terminate yet, she was late");
      const issue = String((thread.proposal as Record<string, unknown> | null)?.issue ?? "");
      expect(issue, `the Issue is the hedge:\n${reply.content}`).not.toMatch(/terminat/i);
      expect(issue, `the account is not the Issue:\n${reply.content}`).toMatch(/she was late/i);
      expect(t.cardCheckCalls?.() ?? 0, "repaired from her words: no model call").toBe(0);
    },
  },
  {
    id: "nov13-card-checked-right-card-unchanged",
    title: "\"CA for Marnie Holloway, she was late on 11/3/26\": a card that is already right is shown as built, with no model call",
    report: REPORT,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      vi.setSystemTime(new Date("2026-11-13T16:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("create a CA for Marnie Holloway, she was late on 11/3/26");
      const issue = String((thread.proposal as Record<string, unknown> | null)?.issue ?? "");
      expect(issue, reply.content).toMatch(/late on 11\/3\/26/);
      expect(reply.content).not.toMatch(/What happened\?/);
      expect(t.cardCheckCalls?.() ?? 0).toBe(0);
    },
  },
];
