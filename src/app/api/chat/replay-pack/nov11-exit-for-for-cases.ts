import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * "I NEED A EXIT FOR FOR <NAME> TM": AN EXIT REQUEST (B-C3, QA's open-case list, 11 Nov 2026; FORM_FOR_FOR_TYPO_ENABLED)
 * ============================================================================
 *
 * The sibling app's Pau scan sf-s36 (a real manager; `nov7-sf-s36-exit-surname-typo-cases.ts` here): "I need a exit for
 * for <name> TM. Quit without notice. …" was never read as an exit request in this app — "exit for for" named no form,
 * and the model answered it. The manager's words; the person is invented (STAFF's Marnie Holloway, typed with the
 * surname one letter off as in the report).
 */
const SAID =
  "I need a exit for for Marnie Halloway TM. Quit without notice. not fulfilling a 2 weeks notice. payroll deduction is applicable. store items were returned.";

export const NOV11_EXIT_FOR_FOR_CASES: ReplayCase[] = [
  {
    id: "nov11-exit-for-for-is-an-exit-request",
    title: `"${SAID.slice(0, 60)}…": the Resignation/Exit Form is proposed`,
    report: "B-C3 (QA's open-case list, 11 Nov 2026): \"a exit for for\" was not read as an exit request",
    status: { open: "the message is answered by the model; no Resignation/Exit Form card" },
    fixFlags: ["FORM_FOR_FOR_TYPO_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say(SAID);
      expect(thread.proposal?.templateKey, `no exit card:\n${reply.content}`).toBe("resignation-exit");
    },
  },
];
