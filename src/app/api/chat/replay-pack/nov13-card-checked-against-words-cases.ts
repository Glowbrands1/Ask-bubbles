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
    // Changed on purpose (13 Nov 2026, main d5e5ea22): 17r-c made TERMINATION_TIDY_HELD_NAME live (#852), which fixes this
    // turn on production; the card check holds it as well (with that flag off: FLAG_CLASSIFY_OFF, in #861's notes).
    status: "fixed",
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
  {
    id: "nov13-17rc-added-detail-kept-on-card",
    title: "QA's 17r-c live test: \"create a CA for Marnie Holloway, she was late on 11/3/26\", then \"she also didn't call to say she'd be late\" on the open card: What happened keeps both facts, and the reply names the change",
    report: "QA's Bubbles 17r-c live test, 13 Nov 2026 (main d5e5ea22): the added detail was lost from What happened and the reply repeated the whole draft",
    status: { open: "What happened is still only \"she was late on 11/3/26\", and the reply does not say what changed" },
    fixFlags: FIX,
    async run(t) {
      vi.setSystemTime(new Date("2026-11-13T16:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("create a CA for Marnie Holloway, she was late on 11/3/26");
      const reply = await thread.say("she also didn't call to say she'd be late");
      const issue = String((thread.proposal as Record<string, unknown> | null)?.issue ?? "");
      expect(issue, `What happened lost the first fact:\n${reply.content}`).toMatch(/late on 11\/3\/26/i);
      expect(issue, `What happened lost the added detail:\n${reply.content}`).toMatch(/didn'?t call/i);
      expect(reply.content, `the reply does not name the change:\n${reply.content}`).toMatch(/(?:added|changed|updated)[^\n]*(?:what happened|issue)|(?:what happened|issue)[^\n]*(?:added|changed|updated|now)/i);
    },
  },
  {
    id: "nov13-card-checked-name-answer-not-a-detail",
    title: "a CA card, then the answer \"Marnie Holloway, Team Member Part Time\": the name and title never join the card's account (Gate-Bubbles-5, S22's class)",
    report: "Gate-Bubbles-5 / Gate-Sunny-2, 13 Nov 2026: a name+title answer was joined to What happened with CARD_CHECKED on",
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      vi.setSystemTime(new Date("2026-11-13T16:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("create a CA for Marnie Holloway, she was late on 11/3/26");
      const reply = await thread.say("Marnie Holloway, Team Member Part Time");
      expect(reply.content, `the name answer was added to the account:\n${reply.content}`).not.toMatch(/\*\*Added to [^\n]*Team/i);
      const issue = String((thread.proposal as Record<string, unknown> | null)?.issue ?? "");
      expect(issue, `the name answer joined the Issue:\n${reply.content}`).not.toMatch(/Team/i);
    },
  },
  {
    id: "nov13-card-checked-request-not-a-detail",
    title: "two forms in one message, then \"marnie holloway needs a written warning for cash handling\": a new request never joins the card's account (Gate-Bubbles-5, owner-retest's class)",
    report: "Gate-Bubbles-5 / Gate-Sunny-2, 13 Nov 2026: a request line was joined to the second card's Issue with CARD_CHECKED on",
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      vi.setSystemTime(new Date("2026-11-13T16:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("coaching form for Remy Calder and a CA for Marnie Holloway");
      const reply = await thread.say("marnie holloway needs a written warning for cash handling");
      expect(reply.content, `the request was added to the account:\n${reply.content}`).not.toMatch(/\*\*Added to [^\n]*needs a written warning/i);
      const issue = String((thread.proposal as Record<string, unknown> | null)?.issue ?? "");
      expect(issue, `the request joined the Issue:\n${reply.content}`).not.toMatch(/needs a written warning/i);
    },
  },
];
