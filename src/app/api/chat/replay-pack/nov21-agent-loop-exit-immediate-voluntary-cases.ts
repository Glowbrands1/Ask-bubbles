import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * "IMMEDIATE VOLUNTARY TERMINATION" TICKS THE IMMEDIATE VOLUNTARY BOX (port from the sibling app: a real manager's exit form, 20 Nov 2026)
 * ============================================================================
 *
 * The sibling app's production, 20 Nov 2026 (an exit form, finalized): the manager's one turn was "Make me an exit form
 * for immideate volunatary termination for <P>". The loop filed a resignation and the saved form ticked no resignation
 * type: the exit form's own reader does not read the misspelled "immideate volunatary", so the manager ticked "Immediate
 * Voluntary Resignation" by hand. The model reads her words; it passes exit_how with exit_how_evidence (her own words),
 * the tool keeps it only on that evidence, and the card, the reply and the saved form tick it. No date she did not give
 * is filled. Her wording, word for word; an invented person (`loop-roster.ts`), this app's exit form (`resignation-exit`).
 */

const REPORT = "The sibling app's production exit form (20 Nov 2026, QA2's report), ported: \"immediate voluntary termination\" was filed with no resignation type ticked";
const SAID = "Make me an exit form for immideate volunatary termination for Thaddea Kroll";

type Out = { card?: Record<string, unknown>; facts?: { exit_ticks?: string[]; exit_unset?: string[] } } | null;

async function run(t: ReplayContext, said: string, how: { quote?: string; value?: string } | null) {
  vi.setSystemTime(new Date("2026-11-20T23:32:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
  const model = loopStandIn((view): LoopDecision => {
    const result = lastResult(view, "propose_form") as Out;
    if (!result) {
      return {
        tool: "propose_form",
        input: {
          template_key: "resignation-exit",
          employee_id: LOOP_THADDEA.id,
          exit_type: "resignation",
          exit_evidence: { ...evidenceFrom(view, said), kind: "asks_for_exit_form" },
          ...(how ? { exit_how: how.value ?? "immediate_voluntary_resignation", exit_how_evidence: evidenceFrom(view, how.quote ?? said) } : {}),
        },
      };
    }
    const ticks = result.facts?.exit_ticks ?? [];
    return { text: `Here's the Resignation/Exit Form for **Thaddea**. ${ticks.length > 0 ? `Filed as: ${ticks.join(", ")}; say if it was a termination instead.` : "How did Thaddea leave: notice given and fulfilled, an immediate resignation, notice not fulfilled, or a no call no show?"} Last day worked isn't set; tell me the date.` };
  });
  t.loopModel!(model);
  const thread = t.thread();
  const reply = await thread.say(said);
  const id = await thread.create();
  return { reply, checked: t.checked(id), values: t.values(id), result: lastResult(model.views.at(-1)!, "propose_form") as Out };
}

const DATES = ["last_day_worked", "notice_given_date", "notice_fulfilled_date", "resignation_date"] as const;

export const NOV21_AGENT_LOOP_EXIT_IMMEDIATE_VOLUNTARY_CASES: ReplayCase[] = [
  {
    id: "nov21-agent-loop-exit-immediate-voluntary-misspelled-ticks-the-box",
    title: `The sibling app's production 20 Nov: "${SAID}" (the model passes exit_how immediate_voluntary_resignation on her words): the card, the reply and the saved form tick Immediate Voluntary Resignation, and no date she did not give is filled`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { reply, checked, values, result } = await run(t, SAID, { quote: "immideate volunatary termination" });
      const saved = JSON.stringify({ values, checked });
      expect(result?.facts?.exit_ticks ?? [], `the card ticks no type:\n${JSON.stringify(result).slice(0, 800)}`).toEqual(["Immediate Voluntary Resignation"]);
      expect(reply.content).toMatch(/Filed as: Immediate Voluntary Resignation/);
      expect(checked.resignation_type ?? [], `the saved form ticks no type:\n${saved}`).toEqual(["immediate_voluntary_resignation"]);
      for (const key of DATES) expect(values[key] ?? "", `${key} was filled though she gave no date:\n${saved}`).toBe("");
    },
  },
  {
    id: "nov21-agent-loop-exit-immediate-voluntary-control-no-evidence-no-tick",
    title: "Control: \"exit form for Thaddea Kroll\" with exit_how quoted from words she never typed: nothing is ticked and the card asks how Thaddea left",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { checked, result } = await run(t, "exit form for Thaddea Kroll", { quote: "immediate voluntary resignation" });
      expect(result?.facts?.exit_ticks ?? []).toEqual([]);
      expect(result?.facts?.exit_unset ?? []).toContain("resignation_type");
      expect(checked.resignation_type ?? []).toEqual([]);
    },
  },
  {
    id: "nov21-agent-loop-exit-immediate-voluntary-control-never-involuntary",
    title: `Control: "${SAID}" with exit_how immediate_involuntary_separation: the loop never ticks the involuntary box from exit_how (only a locked termination does)`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { checked } = await run(t, SAID, { quote: "immideate volunatary termination", value: "immediate_involuntary_separation" });
      expect(checked.resignation_type ?? []).not.toContain("immediate_involuntary_separation");
    },
  },
];
