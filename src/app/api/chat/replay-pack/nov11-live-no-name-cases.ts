import { expect } from "vitest";

import { STAFF, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A REPLY WITH NO NAME ON THE CARD READS CLEANLY (port from Ask Sunny; its round 22 live test, QA, 11 Nov 2026)
 * ============================================================================
 *
 * "create a CA for ima employee" rightly made no card in Ask Sunny, but the reply said "for the the employee" twice and
 * "You can create it now" with no Create button. The slot model reads the employee as "ima employee" (as live there).
 * Same code here (`roster-only-names.ts`, withoutUnseatedName). With this app's production flags the roster-name set is
 * off, so the card keeps "ima employee" as typed; with the set on (as Ask Sunny's round 22), the reply doubles "the" as
 * there. Fixed by NO_NAME_REPLY_WORDING_ENABLED beside the set (checked with FLAG_CLASSIFY_ON, 11 Nov 2026).
 */
const ROSTER_SET = [
  "FORM_NAME_FROM_ROSTER_ENABLED",
  "ROSTER_NEAR_MISS_ENABLED",
  "ROSTER_NAME_IN_CANDIDATE_ENABLED",
  "ROSTER_COMPOUND_SURNAME_ENABLED",
  "ROSTER_NOT_FOUND_ANY_PHRASING_ENABLED",
  "SLOT_NAME_ON_FORM_REQUEST_ENABLED",
  "NEAR_MISS_QUESTION_RULES_ENABLED",
  "NEAR_MISS_DETAILS_ACCEPT_ENABLED",
  "FORM_NAME_OFF_ROSTER_ASK_ENABLED",
  "KEEP_ROSTER_EXACT_NAME_ENABLED",
];
const EVERY_STORE = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const IMA = "create a CA for ima employee";

export const NOV11_LIVE_NO_NAME_CASES: ReplayCase[] = [
  {
    id: "nov11-live-ima-employee-no-doubled-the",
    title: `"${IMA}" (every store): no card, never "the the employee", never "You can create it now"`,
    report: "Ask Sunny round 22 live test (QA, 11 Nov 2026), an account covering every salon; same wording checked here",
    status: { open: "production: a card for \"ima employee\" (roster-name set off); with the set on, \"for the the employee\" and \"You can create it now\" with no Create button" },
    fixFlags: [...ROSTER_SET, "NO_NAME_REPLY_WORDING_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("admin", EVERY_STORE as never);
      t.slotsRead({ employee: "ima employee", formType: "Corrective Action Form", formTurn: true });
      const thread = t.thread();
      const reply = await thread.say(IMA);
      expect(thread.proposal?.employeeName ?? null, "no card for the words").toBeNull();
      expect(reply.content, reply.content).not.toMatch(/\bthe the\b/i);
      expect(reply.content, reply.content).not.toMatch(/You can create it now/);
      expect(reply.content, reply.content).toMatch(/the employee/);
    },
  },
];
