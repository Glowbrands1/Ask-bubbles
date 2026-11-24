import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * A STEP LISTED WITH ONE THE CARD KEEPS IS ON PRIOR ACTIONS, NEVER THE OBSERVATION (QA's live triage on main, 22 Nov
 * 2026, U09)
 * ============================================================================
 *
 * The U09 turns (the person invented): T1 "create a written CA for <P>." T2 "JBA Policy Manual 1-1-2026, Verbal CA
 * 11-1-2026. On 11-1-26 <P> violated care and cleaning of facilities policy". Live on main (both runs), the model's
 * prior_actions held only "Verbal CA 11/1/2026", and the account began "JBA Policy Manual 1/1/2026. On 11/1/26 …". The
 * stand-in plays it that way. The manual's step, listed in the same sentence as the Verbal CA the card keeps, is on the
 * card's Prior actions and out of its Observation. With AGENT_LOOP_LIVE=1 the real model plays both turns.
 */

const REPORT = "QA's live triage (22 Nov 2026, U09 on main): prior actions held only the Verbal CA; \"JBA Policy Manual 1/1/2026\" went into the Observation";
const T1 = "create a written CA for Fenna Prewitt.";
const T2 = "JBA Policy Manual 1-1-2026, Verbal CA 11-1-2026. On 11-1-26 Fenna Prewitt violated care and cleaning of facilities policy";

export const NOV22_AGENT_LOOP_U09_LISTED_STEP_CASES: ReplayCase[] = [
  {
    id: "nov22-u09-listed-step-on-prior-actions-not-observation",
    title: "U09 (live triage): the model keeps only \"Verbal CA 11/1/2026\" and writes \"JBA Policy Manual 1/1/2026.\" into the account — the manual's step, listed with the Verbal CA, is on Prior actions and not in the Observation",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", WEST_DODGE);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form for **Fenna**." };
        const said = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
        const level = { warning_level: "written", level_evidence: evidenceFrom(view, "written", said.startsWith("JBA") ? 1 : 0) };
        if (!said.startsWith("JBA")) return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_FENNA.id, ...level, person_evidence: evidenceFrom(view, "Fenna Prewitt") } };
        return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_FENNA.id, ...level, what_happened: "JBA Policy Manual 1/1/2026. On 11/1/26, Fenna violated the care and cleaning of facilities policy.", incident_date: "2026-11-01", policy: headingWith(view, /care and cleaning/i), prior_actions: "Verbal CA — 11/01/2026", person_evidence: evidenceFrom(view, "Fenna Prewitt") } };
      }));
      const thread = t.thread();
      await thread.say(T1);
      await thread.say(T2);
      const card = thread.proposal as { issue?: string; priorActions?: string } | null;
      /* The manual's step in any wording the model gives it ("JBA Policy Manual acknowledged — 1/1/2026", live), with its date. */
      expect(card?.priorActions ?? "", "the manual's step is not on Prior actions").toMatch(/Policy Manual[^;\n]*\b0?1\/0?1\/(?:20)?26\b/i);
      expect(card?.priorActions ?? "", "the Verbal CA left Prior actions").toMatch(/Verbal CA/);
      expect(card?.issue ?? "", "the manual's step is in the Observation").not.toMatch(/1\/1\/2026|Policy Manual/);
      expect(card?.issue ?? "", "the incident left the Observation").toMatch(/violated/i);
      const id = await thread.create();
      expect(t.values(id).prior_actions ?? "", "the saved Prior actions lost the manual's step").toMatch(/Policy Manual[^;\n]*\b0?1\/0?1\/(?:20)?26\b/i);
    },
  },
];
