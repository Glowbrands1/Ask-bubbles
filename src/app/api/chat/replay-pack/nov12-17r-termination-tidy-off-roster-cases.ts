import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * THE TERMINATION HEDGE ON THE OFF-ROSTER ASK PATH (QA's 17r live note, 12 Nov 2026)
 * ============================================================================
 *
 * TERMINATION_CARD_TIDY (#829, live in 17r) makes "CA for <A>, do not terminate yet, she was late" an Issue of "she was
 * late". For a name NOT on the store's roster, turn 1 is the off-roster "use <B>" ask, the name is held off the card,
 * and the card still carried "Issue: do not terminate yet": the tidy reads the account after the card's employee, and
 * there was none. The tester's wording; <B> is an invented name that is on no roster.
 * TERMINATION_TIDY_HELD_NAME_ENABLED reads the account after the name the reply could not find.
 */

const SAID = "CA for Corwin Ashdale, do not terminate yet, she was late";

export const NOV12_17R_TERMINATION_TIDY_OFF_ROSTER_CASES: ReplayCase[] = [
  {
    id: "nov12-17r-termination-tidy-off-roster-ask",
    title: `"${SAID}" (not on the roster): the held card's Issue is "she was late", never "do not terminate yet"`,
    report: "QA's 17r live note on #829, 12 Nov 2026: on the off-roster ask path the card still says Issue: do not terminate yet",
    status: { open: "the held card's Issue is \"do not terminate yet\"" },
    fixFlags: ["TERMINATION_TIDY_HELD_NAME_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-12T16:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say(SAID);
      expect(reply.content, `not the off-roster ask:\n${reply.content}`).toMatch(/use Corwin Ashdale/);
      const issue = String((thread.proposal as Record<string, unknown> | null)?.issue ?? "");
      expect(issue, `the Issue is the hedge:\n${JSON.stringify(thread.proposal)}`).not.toMatch(/terminat/i);
      expect(issue, `the account is not the Issue:\n${JSON.stringify(thread.proposal)}`).toMatch(/she was late/i);
      expect(reply.content, "a termination was ticked from a hedge").not.toMatch(/Termination, as you said/);
    },
  },
];
