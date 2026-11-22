import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * THE INCIDENT'S OWN CLAUSE IS NEVER A PRIOR STEP (Ask Sunny's port of #1054, via QA, 22 Nov 2026)
 * ============================================================================
 *
 * The manager's turn (the person invented): "ca for <P>, she was late on 11/12, she had a verbal on 10/2". The model passed
 * no incident date. #1054's listedWithKeptSteps read "she was late on 11/12", a comma clause of a few words then a date in
 * the same sentence as the Verbal the card keeps, as a step too: Prior actions "Verbal CA — 10/02/2026; she was late on —
 * 11/12/2026". The lateness is this incident (its date is the card's own account's). The Verbal stays on Prior actions.
 */

const REPORT = "QA (22 Nov 2026, Ask Sunny's port of #1054): \"ca for <P>, she was late on 11/12, she had a verbal on 10/2\" listed the incident's own clause as a prior step";
const T1 = "ca for Fenna Prewitt, she was late on 11/12, she had a verbal on 10/2";

export const NOV22_AGENT_LOOP_LISTED_STEP_NOT_INCIDENT_CASES: ReplayCase[] = [
  {
    id: "nov22-listed-step-incident-clause-not-a-prior-step",
    title: "\"ca for <P>, she was late on 11/12, she had a verbal on 10/2\" (no incident date passed): Prior actions holds the Verbal of 10/2 and never the lateness of 11/12, the incident",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", WEST_DODGE);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form for **Fenna**." };
        return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_FENNA.id, person_evidence: evidenceFrom(view, "Fenna Prewitt"), what_happened: "Fenna was late on 11/12.", policy: headingWith(view, /^attendance/i), prior_actions: "Verbal CA — 10/02/2026" } };
      }));
      const thread = t.thread();
      await thread.say(T1);
      const prior = (thread.proposal as { priorActions?: string | null } | null)?.priorActions ?? "";
      expect(prior, "the Verbal of 10/2 left Prior actions").toMatch(/Verbal CA — 10\/02\/2026/);
      expect(prior, "the incident's own clause is a prior step").not.toMatch(/11\/12|late/i);
    },
  },
];
