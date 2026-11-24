import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * ONE PRIOR STEP WITH A PROBLEM NEVER DROPS THE OTHERS (QA's Bubbles round 2, 22 Nov 2026, U09)
 * ============================================================================
 *
 * The manager's turns (the person invented): T1 "create a written CA for <P6>." T2 "JBA Policy Manual 1-1-2026, Verbal CA
 * 11-1-2026. On 11-1-26 <P6> violated care and cleaning of facilities policy". The card kept NO prior action ("11-1-2026
 * is this incident's own date"), throwing away the manual acknowledgement of 1-1-2026 too. Each step is now checked on
 * its own: the good ones stay, and only the questioned one is left off, with its reason.
 */

const REPORT = "QA's Bubbles round 2 (22 Nov 2026, U09): prior_actions_not_kept threw away the whole line, including \"JBA Policy Manual 1-1-2026\"";
const T1 = "create a written CA for Fenna Prewitt.";
const T2 = "JBA Policy Manual 1-1-2026, Verbal CA 11-1-2026. On 11-1-26 Fenna Prewitt violated care and cleaning of facilities policy";

type Out = { card?: { prior_actions?: string | null }; facts?: { prior_steps_left_off?: { step: string; reason: string }[] } } | null;

export const NOV22_AGENT_LOOP_PRIOR_ACTIONS_KEEP_GOOD_STEPS_CASES: ReplayCase[] = [
  {
    id: "nov22-r2-u09-good-prior-step-kept",
    title: "U09: T2 \"JBA Policy Manual 1-1-2026, Verbal CA 11-1-2026. On 11-1-26 <P> violated …\": both steps the manager dated stay on the card's Prior actions: the manual of 1-1-2026 and the Verbal CA of 11-1-2026, though that is also the incident's day",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", WEST_DODGE);
      const model = loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form for **Fenna**." };
        const said = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
        const level = { warning_level: "written", level_evidence: evidenceFrom(view, "written", said.startsWith("JBA") ? 1 : 0) };
        if (!said.startsWith("JBA")) return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_FENNA.id, ...level, person_evidence: evidenceFrom(view, "Fenna Prewitt") } };
        return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_FENNA.id, ...level, what_happened: "On 11/1/26 Fenna violated the care and cleaning of facilities policy.", incident_date: "2026-11-01", policy: headingWith(view, /care and cleaning/i), prior_actions: "JBA Policy Manual — 01/01/2026; Verbal CA — 11/01/2026", person_evidence: evidenceFrom(view, "Fenna Prewitt") } };
      });
      t.loopModel!(model);
      const thread = t.thread();
      await thread.say(T1);
      await thread.say(T2);
      const result = model.views.flatMap((view) => view.results.filter((entry) => entry.tool === "propose_form")).at(-1)?.output as Out;
      expect(result?.card?.prior_actions ?? "", `the good step was dropped:\n${JSON.stringify(result).slice(0, 600)}`).toMatch(/JBA Policy Manual — 01\/01\/2026/);
      /*
       * CHANGED ON PURPOSE (QA's live round-2 re-run, 22 Nov 2026, U09: "the stated prior is NOT listed"): the Verbal CA's
       * date is the incident's day, but the manager typed it right after the step ("Verbal CA 11-1-2026"), so it is that
       * step's own date and stays on the card (`datedByManagerForStep`). This case used to expect it left off.
       */
      expect(result?.card?.prior_actions ?? "", `the Verbal CA the manager dated is not on the card:\n${JSON.stringify(result).slice(0, 600)}`).toMatch(/Verbal CA — 11\/01\/2026/);
      expect(result?.facts?.prior_steps_left_off ?? [], "a stated step was left off").toEqual([]);
    },
  },
];
