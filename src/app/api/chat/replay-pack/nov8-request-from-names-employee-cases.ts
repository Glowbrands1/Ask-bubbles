import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * "ANOTHER CORRECTIVE ACTION FROM <A>" NAMED NOBODY (QA, 8 Nov 2026)
 * ============================================================================
 *
 * The managers' wording, found with QA's Woven replays (8 Nov 2026): "Please create another corrective action from
 * <A>. This would be a verbal due to not completing her woven courses by the deadline" — "from" typed for "for" —
 * gave "Who is this form for? Tell me the employee's full name." here; the sibling app reads <A>. A name in any case
 * is read only straight after "<form> for" (`forms/proposal.ts`, protected). REQUEST_FROM_NAMES_EMPLOYEE_ENABLED
 * (`forms/template-intent.ts` canonicalShorthand). The person is the pack's invented Marnie Holloway.
 */

const SAID = "Please create another corrective action from marnie holloway. This would be a verbal due to not completing her woven courses by the deadline";
const FIX = ["REQUEST_FROM_NAMES_EMPLOYEE_ENABLED"];
const REPORT = "QA, 8 Nov 2026 (the managers' wording): \"another corrective action from <A>\" asked who the form is for";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-07T15:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV8_REQUEST_FROM_NAMES_EMPLOYEE_CASES: ReplayCase[] = [
  {
    id: "nov8-request-from-names-employee",
    title: "\"Please create another corrective action from marnie holloway. …\": the card is Marnie Holloway's, never \"Who is this form for?\"",
    report: REPORT,
    status: { open: "the card asks \"Who is this form for? Tell me the employee's full name.\"" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const reply = await thread.say(SAID);
      expect(thread.proposal, "no Corrective Action card").toMatchObject({ templateKey: "dpoa", employeeName: "Marnie Holloway" });
      expect(reply.content, "the card asks who").not.toMatch(/Who is this form for\?/);
    },
  },
  {
    id: "nov8-request-from-not-a-name",
    title: "negative: \"a corrective action from last week\" names nobody",
    report: `${REPORT} (the condition)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say("I need to redo the corrective action from last week, she was late again on 11/2/26");
      expect(thread.proposal?.employeeName ?? "", "a word after \"from\" became the employee").not.toMatch(/last|week/i);
    },
  },
  {
    id: "nov8-request-from-month-not-a-name",
    title: "negative (the round-5 gate): \"… given verbal warning on 9/21. she has a written warning from august\": August is no person, the card is Marnie Holloway's at Verbal",
    report: "QA, the Bubbles round-5 gate (8 Nov 2026): with REQUEST_FROM_NAMES_EMPLOYEE on, \"from august\" named a second employee and the level was dropped",
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("create a ca form for marnie holloway, she was late again for 30 mins today. given verbal warning on 9/21. she has a written warning from august");
      expect(thread.proposal, `no card for her:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Marnie Holloway" });
      expect(reply.content, `"august" was read as a person:\n${reply.content}`).not.toMatch(/\baugust\b[^\n]*\b(?:which|who)\b|Which of them/i);
      expect((thread.proposal as { warningLevel?: string | null } | null)?.warningLevel ?? null, `the level was dropped:\n${reply.content}`).toBe("verbal");
    },
  },
];
