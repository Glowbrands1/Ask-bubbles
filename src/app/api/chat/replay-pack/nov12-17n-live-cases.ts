import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext, type ReplayThread } from "./cases";

/**
 * ============================================================================
 * QA's BUBBLES 17n LIVE TEST (main c88676ac, 12 Nov 2026)
 * ============================================================================
 *
 * The managers' wording, the employee invented (on the pack's roster).
 */
const REPORT = "QA's Bubbles 17n live test, 12 Nov 2026";

function start(t: ReplayContext): ReplayThread {
  vi.setSystemTime(new Date("2026-11-12T10:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV12_17N_LIVE_CASES: ReplayCase[] = [
  {
    id: "nov12-17n-4b-late-to-reoepn-is-late-opening",
    title: "4b: \"he was late to reoepn the store on 11/9\" cites Late Opening (p.15), not Attendance from \"late\"",
    report: REPORT,
    status: { open: "the card cites Attendance p.14 from \"late\"" },
    fixFlags: ["REOPEN_IS_OPENING_ENABLED"],
    async run(t) {
      const reply = await start(t).say("create a corrective action for Remy Calder, he was late to reoepn the store on 11/9");
      expect(reply.content, reply.content).toMatch(/\*\*Policy:\*\* Late Opening\b/);
      expect(reply.content, reply.content).not.toMatch(/\*\*Policy:\*\* Attendance\b/);
    },
  },
  {
    id: "nov12-17n-4c-bare-form-name-asks-what",
    title: "4c: a pasted bare \"Corrective Action Form\" asks what the manager needs, with no empty card",
    report: REPORT,
    status: { open: "\"Who is this form for? Tell me the employee's full name.\" over an empty card" },
    fixFlags: ["BARE_FORM_NAME_ASKS_WHAT_ENABLED"],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("Corrective Action Form");
      expect(reply.content, reply.content).toMatch(/What do you need on the \*\*Corrective Action Form\*\*/);
      expect(reply.formProposal, "an empty card is shown").toBeUndefined();
    },
  },
];
