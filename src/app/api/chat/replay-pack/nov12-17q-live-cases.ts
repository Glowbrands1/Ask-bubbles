import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext, type ReplayThread } from "./cases";

/**
 * ============================================================================
 * QA's BUBBLES 17q LIVE TEST (12 Nov 2026) — two misses, no rollback
 * ============================================================================
 *
 * The managers' wording, the employee invented (on the pack's roster).
 *
 *   (1) "create a CA for <B>, she rang up the wrong items on 11/9" cites the Standards of Conduct
 *       (REGISTER_ACCURACY_CONDUCT) but its Policy line gives no page, while Attendance and Animals give theirs
 *       (POLICY_DASH_LINE_PAGE_ENABLED, `forms/policy-page-on-card.ts`).
 *   (2) Item 7: after "she was late on 11/3/26", "she also left the register unlocked" reached the saved Observation,
 *       but the card's "What happened" still showed only the lateness. Fixed in production by CARD_CHECKED_AGAINST_WORDS
 *       (QA round 17w); its own fix, ADDED_ACCOUNT_ON_CARD, was dropped (14 Nov 2026): with CARD_CHECKED on it only
 *       repeated the added fact ("…; she left the register unlocked. She also left the register unlocked").
 */
const REPORT = "QA's Bubbles 17q live test, 12 Nov 2026";

function start(t: ReplayContext): ReplayThread {
  vi.setSystemTime(new Date("2026-11-12T10:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

function policyLine(content: string): string {
  return content.split("\n").find((line) => line.startsWith("**Policy:**")) ?? "";
}

export const NOV12_17Q_LIVE_CASES: ReplayCase[] = [
  {
    id: "nov12-17q-1-wrong-items-policy-page",
    title: "(1) \"she rang up the wrong items on 11/9\": the Standards of Conduct Policy line carries its printed page (p.12)",
    report: `${REPORT}: (1) the register-accuracy Policy line has no page`,
    status: { open: "**Policy:** Standards of Conduct — ringing up a sale inaccurately, with no page" },
    fixFlags: ["POLICY_DASH_LINE_PAGE_ENABLED"],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("create a CA for Marnie Holloway, she rang up the wrong items on 11/9");
      expect(thread.proposal, `no CA card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Marnie Holloway" });
      const line = policyLine(reply.content);
      expect(line, `the card does not cite the Standards of Conduct:\n${reply.content}`).toMatch(/Standards of Conduct/);
      expect(line, `the Policy line has no printed page:\n${line}`).toMatch(/Standards of Conduct \(JBA Policy Manual p\.12\) — ringing up a sale inaccurately/);
    },
  },
  {
    id: "nov12-17q-7-also-left-register-unlocked-on-card",
    title: "(2) item 7: \"she also left the register unlocked\" shows in the card's What happened, as in the saved Observation",
    report: `${REPORT}: item 7, the card's What happened shows only "she was late on 11/3/26"`,
    // Changed on purpose (14 Nov 2026, QA): fixed in production by CARD_CHECKED_AGAINST_WORDS (round 17w); its own fix
    // flag ADDED_ACCOUNT_ON_CARD was dropped. Was OPEN.
    status: "fixed",
    async run(t) {
      const thread = start(t);
      await thread.say("create a CA for Marnie Holloway, she was late on 11/3/26");
      const reply = await thread.say("she also left the register unlocked");
      expect(thread.proposal, `no CA card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Marnie Holloway" });
      const issue = (reply.formProposal as { issue?: string | null } | undefined)?.issue ?? "";
      expect(issue, `the card's What happened:\n${issue}`).toMatch(/late on 11\/3\/26/);
      expect(issue, `the card's What happened leaves out the register:\n${issue}`).toMatch(/left the register unlocked/i);
      expect(reply.content, `the reply's Issue line leaves out the register:\n${reply.content}`).toMatch(/\*\*Issue:\*\*[^\n]*late on 11\/3\/26[^\n]*left the register unlocked/i);
    },
  },
  {
    id: "nov12-17q-7-answer-not-added-to-card",
    title: "(2) guard: an answer to the card's question (\"verbal warning\") is never added to What happened",
    report: `${REPORT}: item 7, guard`,
    // Changed on purpose (14 Nov 2026): the guard now holds on production's own path (ADDED_ACCOUNT_ON_CARD dropped).
    status: "fixed",
    async run(t) {
      const thread = start(t);
      await thread.say("create a CA for Marnie Holloway, she was late on 11/3/26");
      const reply = await thread.say("verbal warning");
      const issue = (reply.formProposal as { issue?: string | null } | undefined)?.issue ?? "";
      expect(issue, `the answer joined What happened:\n${issue}`).not.toMatch(/verbal/i);
    },
  },
];
