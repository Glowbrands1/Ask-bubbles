import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * A PRIOR STEP KEEPS THE MANUAL THE MANAGER NAMED (QA's live re-test, 21 Nov 2026, A6/A7, item 8)
 * ============================================================================
 *
 * "previous coaching was jba policy manual 1-1-26": the card and the saved form listed "Coaching — 01/01/2026", the
 * manual lost; "previous coaching is jba policy manual 1-1-26" (A2) kept it. Today's reading of the manager's words
 * (`statedPriorActions`, the prior_steps_said fact) reads both the same, "Coaching — JBA Policy Manual — 01/01/2026";
 * the line on the card was the live model's, kept as it wrote it. The loop now puts back a topic the manager named for
 * a step's date that the model's line for that date left out. QA's wording; invented person (`loop-roster.ts`).
 */

const REPORT = "QA's live re-test (21 Nov 2026, Pau's account, agent loop on, 3e2c30dd), A6/A7: \"previous coaching was jba policy manual 1-1-26\" saved \"Coaching — 01/01/2026\"; expected the manual named";
const SAID = "create verbal CA for Fenna Prewitt for violating visitors at work policy on 10-10-26. Fenna spent 40 minutes talking with friend and ignoring guests. previous coaching was jba policy manual 1-1-26";

export const NOV21_AGENT_LOOP_PRIOR_COACHING_MANUAL_CASES: ReplayCase[] = [
  {
    id: "nov21-agent-loop-prior-coaching-was-manual-kept",
    title: "\"previous coaching was jba policy manual 1-1-26\" and the model writes \"Coaching — 01/01/2026\": the card and the saved Prior actions name the JBA Policy Manual",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", WEST_DODGE);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form for **Fenna Prewitt**." };
        return {
          tool: "propose_form",
          input: {
            template_key: "dpoa", employee_id: LOOP_FENNA.id, person_evidence: evidenceFrom(view, "Fenna Prewitt"),
            warning_level: "verbal", level_evidence: evidenceFrom(view, "verbal"),
            what_happened: "Fenna spent 40 minutes talking with a friend and ignoring guests on 10/10/2026.", incident_date: "2026-10-10",
            // The live model's line: the date kept, the manual the manager named dropped.
            prior_actions: "Coaching — 01/01/2026",
          },
        };
      }));
      const thread = t.thread();
      await thread.say(SAID);
      expect(thread.proposal, "no card was made (the case proves nothing)").not.toBeNull();
      const card = (thread.proposal as { priorActions?: string | null }).priorActions ?? "";
      expect(card, `the card's prior actions lost the manual: "${card}"`).toMatch(/JBA Policy Manual/);
      expect(card).toMatch(/01\/01\/2026/);
      const id = await thread.create();
      const saved = t.values(id).prior_actions ?? "";
      expect(saved, `the saved prior actions lost the manual: "${saved}"`).toMatch(/JBA Policy Manual/);
      expect(saved).toMatch(/01\/01\/2026/);
    },
  },
  {
    id: "nov21-agent-loop-prior-coaching-model-line-with-manual-kept",
    title: "control: the model's own line already names the manual (\"JBA Policy Manual — 01/01/2026\", A2's card): kept exactly as it wrote it",
    report: `${REPORT}; A2's "previous coaching is jba policy manual 1-1-26", which worked`,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", WEST_DODGE);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form for **Fenna Prewitt**." };
        return {
          tool: "propose_form",
          input: {
            template_key: "dpoa", employee_id: LOOP_FENNA.id, person_evidence: evidenceFrom(view, "Fenna Prewitt"),
            what_happened: "Fenna opened the store late on 10/1/2026.", incident_date: "2026-10-01",
            prior_actions: "JBA Policy Manual — 01/01/2026",
          },
        };
      }));
      const thread = t.thread();
      await thread.say("create verbal ca for Fenna Prewitt for opening store late on 10-1-26. previous coaching is jba policy manual 1-1-26.");
      expect((thread.proposal as { priorActions?: string | null } | null)?.priorActions).toBe("JBA Policy Manual — 01/01/2026");
    },
  },
];
