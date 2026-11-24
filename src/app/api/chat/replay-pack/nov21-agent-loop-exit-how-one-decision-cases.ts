import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * THE EXIT CARD'S TYPE, ITS REPLY AND THE SAVED FORM ARE ONE DECISION (port from the sibling app: QA2's live check of its exit_how, 21 Nov 2026)
 * ============================================================================
 *
 * Turns "create an exit for <A>" → "last day worked 11-10-26. <A> quit without notice. payroll deduct applies" → "On
 * 11-14-26 Store Manager, <B>, messaged <A> asking if she forgot to clock in or come to work on 11-13-26. <A> replied
 * stating, "I didn't come in, I'm actually going to resign…"". The exit form's own reader ticks "quit without notice" as
 * Immediate Voluntary Resignation and the reply said so, but the card carried the model's exit_how no_call_no_show, which
 * Create would tick. When the reader has ticked a type, that is the card's type: exit_how is not carried. QA2's wording
 * (this app's store title); invented people: Thaddea Kroll (<A>, `loop-roster.ts`) and Corwin Ashdale (<B>, nobody on the
 * roster); this app's exit form (`resignation-exit`).
 */

const REPORT = "The sibling app's QA2, live check of exit_how (21 Nov 2026), ported: the card's exitHow was no_call_no_show while the reply said \"Filed as: Immediate Voluntary Resignation\"";
const T1 = "create an exit for Thaddea Kroll";
const T2 = "last day worked 11-10-26. Thaddea Kroll quit without notice. payroll deduct applies";
const T3 = "On 11-14-26 Store Manager, Corwin Ashdale, messaged Thaddea Kroll asking if she forgot to clock in or come to work on 11-13-26. Thaddea Kroll replied stating, \"I didn't come in, I'm actually going to resign…\"";

type Out = { facts?: { exit_ticks?: string[] } } | null;

export const NOV21_AGENT_LOOP_EXIT_HOW_ONE_DECISION_CASES: ReplayCase[] = [
  {
    id: "nov21-agent-loop-exit-how-reader-tick-wins-card-reply-saved-agree",
    title: "QA2's live check: three turns ending \"…I didn't come in, I'm actually going to resign…\" (the model passes exit_how no_call_no_show): the card, the reply and the saved form all say Immediate Voluntary Resignation",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", WEST_DODGE);
      const model = loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as Out;
        if (result) return { text: `Here's the Resignation/Exit Form for **Thaddea**. Filed as: ${(result.facts?.exit_ticks ?? []).join(", ") || "nothing yet"}.` };
        const asks = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0);
        const said = asks.at(-1)?.text ?? "";
        const third = /actually going to resign/.test(said);
        /* The exit form was asked for in the first turn: its evidence is that turn (back = turns since). */
        const firstBack = asks.length - 1 - asks.findIndex((turn) => turn.text.includes(T1));
        return {
          tool: "propose_form",
          input: {
            template_key: "resignation-exit", employee_id: LOOP_THADDEA.id, exit_type: "resignation",
            exit_evidence: { ...evidenceFrom(view, T1, firstBack), kind: "asks_for_exit_form" },
            what_happened: third ? "Thaddea quit without notice; Thaddea replied that Thaddea did not come in and is going to resign." : "Thaddea quit without notice.",
            ...(third ? { exit_how: "no_call_no_show", exit_how_evidence: evidenceFrom(view, "I didn't come in") } : {}),
          },
        };
      });
      t.loopModel!(model);
      const thread = t.thread();
      await thread.say(T1);
      await thread.say(T2);
      const reply = await thread.say(T3);
      const card = thread.proposal as { exitHow?: string } | null | undefined;
      expect(reply.content, "the reply's type (the case proves nothing without it)").toMatch(/Filed as: Immediate Voluntary Resignation/);
      expect(card?.exitHow, "the card carries a type the reply did not say").toBeUndefined();
      const id = await thread.create();
      const checked = t.checked(id);
      expect(checked.resignation_type ?? [], `the saved type disagrees with the reply:\n${JSON.stringify(checked)}`).toEqual(["immediate_voluntary_resignation"]);
    },
  },
];
