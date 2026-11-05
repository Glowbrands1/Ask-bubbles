import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayAnswer, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * TWINS OF THE SIBLING APP'S SALES-FLIP GATE REGRESSIONS (ask-sunny#530, 5 Nov 2026)
 * ============================================================================
 *
 * With FORM_NAME_FROM_ROSTER_ENABLED on, `forms/roster-only-names.ts` takes an
 * off-roster employee off the card after the reply is built. The gate found
 * two rows where the rest of the reply still spoke for the removed person:
 *
 *   nov3-street-then-placeholder, turn 2: it asked who, but the coaching
 *     preview still said "Everything I need is here … I have the employee and
 *     the store".
 *   nov5-roster-only-ima-off-roster: it asked who, but the Observation read
 *     "ima employee, opening the store late on 9-28-26".
 *
 * Ported from Ask Sunny. In this app neither row showed on these turns (the
 * name is announced as not on the roster, and no Observation is drafted
 * before the employee is known), so the twins pin only the invariants: with
 * the employee taken off, nothing in the reply says it has one, and the
 * removed name never opens an Observation. Both hold with production's flags
 * and with the flip's. "ima employee" is invented and on no roster.
 */

const FLAG = "FORM_NAME_FROM_ROSTER_ENABLED";
const SALES = "CA_SALES_POLICY_ENABLED";
const GLOSSARY = "CHAT_GLOSSARY_ENABLED";

// This app may ask in its details list ("1. The employee's full name …"), as nov5-request-slot-cases.ts accepts.
const ASKS_WHO = /Who is this (?:\*\*[^*]+\*\* |form )?for\?|employee'?s full name/i;
// QA, 5 Nov 2026: "Create the draft here when you're ready" beside the asks-who contradicts it too.
const CLAIMS_READY = /Everything I need is here|I have the employee|Create the draft here when you're ready/i;

/** The card's Observation of Offense line, or "". */
function observationLine(reply: ReplayAnswer): string {
  return reply.content.split("\n").find((line) => /\*\*Observation of Offense:?\*\*/i.test(line)) ?? "";
}

export const NOV5_TWIN_GATE_ROSTER_ONLY_CLAIMS_CASES: ReplayCase[] = [
  {
    id: "nov5-twin-gate-street-placeholder-no-ready-claim",
    title: "gate regression 1: \"make a coaching form for <name>, she was late today\" asks who and never says \"I have the employee\"; \"<name>\" never opens the Observation",
    report: "the sibling app's sales-flip gate (ask-sunny#530, 5 Nov 2026): nov3-street-then-placeholder turn 2, on — asks who, but the preview says \"Everything I need is here … I have the employee and the store\"",
    status: "fixed",
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      vi.setSystemTime(new Date("2026-10-26T15:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("coaching form for 123 Main Street");
      const reply = await thread.say("make a coaching form for <name>, she was late today");
      expect(reply.formProposal?.employeeName ?? null, "a non-person is the employee").toBeNull();
      expect(reply.content, `does not ask who:\n${reply.content}`).toMatch(ASKS_WHO);
      expect(reply.content, `says it has the employee while asking who:\n${reply.content}`).not.toMatch(CLAIMS_READY);
      expect(observationLine(reply), "the placeholder opens the Observation").not.toMatch(/<name>/i);
    },
  },
  {
    id: "nov5-twin-gate-ima-off-roster-observation",
    title: "gate regression 2: \"create a CA form for ima employee, for opening the store late on 9-28-26\" asks who; the Observation is \"opening the store late on 9-28-26\", never \"ima employee, …\"",
    report: "the sibling app's sales-flip gate (ask-sunny#530, 5 Nov 2026): nov5-roster-only-ima-off-roster, on — asks who, but the Observation becomes \"ima employee, opening the store late on 9-28-26\"",
    status: "fixed",
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-05T15:30:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("create a CA form for ima employee, for opening the store late on 9-28-26");
      expect(thread.proposal?.employeeName ?? null, "a name on no roster is the employee").toBeNull();
      expect(reply.content, `does not ask who:\n${reply.content}`).toMatch(ASKS_WHO);
      expect(observationLine(reply), "the removed name is in the Observation").not.toMatch(/\bima\b/i);
    },
  },
];
