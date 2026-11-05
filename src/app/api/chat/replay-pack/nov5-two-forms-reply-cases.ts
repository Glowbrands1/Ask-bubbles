import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * TWO FORMS: EACH SECTION OF THE REPLY NAMES ITS OWN CARD'S PERSON (QA's tester, 5 Nov 2026)
 * ============================================================================
 *
 * The Bubbles smaller flip (CA_SALES + REPLY_MATCHES_CARD + TITLE + METRIC_GUARD), item 6 "two forms": the
 * cards were right (a Coaching Form for R, a Corrective Action Form for R2), but the reply's Corrective Action
 * section said "I can create a Corrective Action Form for [R]." REPLY_MATCHES_CARD read only the first card.
 * Two people on the cases' own fixture roster (invented).
 */
const FLIP = ["CHAT_GLOSSARY_ENABLED", "CA_SALES_POLICY_ENABLED", "REPLY_MATCHES_CARD_ENABLED", "TITLE_OF_THE_EMPLOYEE_ENABLED", "METRIC_GUARD_ENABLED"];

function start(t: ReplayContext) {
  for (const flag of FLIP) vi.stubEnv(flag, "true");
  vi.setSystemTime(new Date("2026-11-05T15:30:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV5_TWO_FORMS_REPLY_CASES: ReplayCase[] = [
  {
    id: "nov5-two-forms-reply-each-card",
    title: "the flip set: \"coaching form for Marnie Holloway … and a CA for Remy Calder …\": the Corrective Action section names Remy Calder, the Coaching section Marnie Holloway",
    report: "QA's tester on the Bubbles smaller flip (5 Nov 2026), item 6 \"two forms\": the CA section named the Coaching card's person",
    status: "fixed",
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("I need a coaching form for Marnie Holloway for her customer service at the register, and a CA for Remy Calder for opening the store late on 11/2");
      const cards = ((reply as { formProposals?: { templateName?: string; employeeName?: string | null }[] }).formProposals ?? []);
      expect(cards.map((card) => card.employeeName), `not one card for each:\n${reply.content}`).toEqual(expect.arrayContaining(["Marnie Holloway", "Remy Calder"]));
      expect(reply.content, `the Corrective Action section names the Coaching card's person:\n${reply.content}`).not.toMatch(/\*\*Corrective Action Form\*\* for \*\*Marnie Holloway\*\*/);
      expect(reply.content, `the Coaching section names the Corrective Action card's person:\n${reply.content}`).not.toMatch(/\*\*Coaching Form\*\* for \*\*Remy Calder\*\*/);
    },
  },
];
