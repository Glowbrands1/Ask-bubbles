import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * QA'S 17o LIVE NOTES ON TERMINATION (12 Nov 2026, main 815ae303; TERMINATION_CARD_TIDY_ENABLED)
 * ============================================================================
 *
 * (1) "CA for <A>, do not terminate yet, she was late" → "**Issue:** do not terminate yet": the account was lost from the
 * Issue; the hedge never is one. (2) "I need a term CA for <A>, no call no show." → the Action plan line ran straight
 * into the next line, with no blank line. The tester's wording; the person is STAFF's invented Marnie Holloway.
 */
const FLAG = "TERMINATION_CARD_TIDY_ENABLED";
const REPORT = "QA's 17o live notes on termination, 12 Nov 2026 (main 815ae303)";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-12T16:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV12_17O_TERMINATION_CARD_TIDY_CASES: ReplayCase[] = [
  {
    id: "nov12-17o-issue-not-termination-hedge",
    title: "17o (1): \"CA for <A>, do not terminate yet, she was late\": the Issue is \"she was late\", never \"do not terminate yet\"",
    report: REPORT,
    status: { open: "**Issue:** do not terminate yet" },
    fixFlags: [FLAG],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("CA for Marnie Holloway, do not terminate yet, she was late");
      const issue = /\*\*Issue:\*\*\s*([^·\n]+)/.exec(reply.content)?.[1]?.trim() ?? "";
      expect(issue, `the Issue is the hedge:\n${reply.content}`).not.toMatch(/terminat/i);
      expect(issue, `the account is not the Issue:\n${reply.content}`).toMatch(/she was late/i);
      expect(String((thread.proposal as Record<string, unknown> | null)?.issue ?? "")).toMatch(/she was late/i);
      expect(reply.content, "a termination was ticked from a hedge").not.toMatch(/Termination, as you said/);
    },
  },
  {
    id: "nov12-17o-term-plan-line-break",
    title: "17o (2): \"I need a term CA for <A>, no call no show.\": the Action plan line is its own paragraph",
    report: REPORT,
    status: { open: "the Action plan line runs straight into the next line, no blank line" },
    fixFlags: [FLAG, "TERMINATION_STATED_TICKS_ENABLED"],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("I need a term CA for Marnie Holloway, no call no show.");
      expect(reply.content, `not the termination card:\n${reply.content}`).toMatch(/Effective immediately, employment is terminated following the progressive corrective action plan\./);
      expect(reply.content, `the plan runs into the next line:\n${reply.content}`).toMatch(/progressive corrective action plan\.(?:\n\n|$)/);
    },
  },
];
