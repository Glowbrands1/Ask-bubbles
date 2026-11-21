import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * "GAVE NOTICE AND IS FULFILLING IT" NEVER ALSO TICKS "DID NOT FULFILL" (QA's Bubbles live re-run, 22 Nov 2026, B6)
 * ============================================================================
 *
 * The manager's first and last turns, word for word (names invented): T1 "can you make me an exit form for <P1> she is
 * in woven under <P2>. Her last day is nov 23 she is returning her key she gave 2 weeks notice and is fulfilling them.
 * no deduction at this time" … T6 "she is resigning due to second job I'm ready for the draft". From T4 the card said
 * "Filed as: Submitted & Fulfilled Notice, Did not fulfill required 14 day / 30 day notice", and the saved draft had
 * both boxes. The template's Resignation Details are one set of boxes split into two groups for the page's layout
 * (`exit-library.ts`): the exit reader's tick in either group is the one decision, and the model's exit_how is not
 * carried beside it, at card time and again at Create.
 */

const REPORT = "QA's Bubbles live re-run (22 Nov 2026, B6): the card and the saved draft ticked Submitted & Fulfilled Notice AND Did not fulfill required 14 day / 30 day notice";
const T1 = "can you make me an exit form for Thaddea she is in woven under Thaddea Kroll. Her last day is nov 23 she is returning her key she gave 2 weeks notice and is fulfilling them. no deduction at this time";
const T6 = "she is resigning due to second job I'm ready for the draft";

type Out = { facts?: { exit_ticks?: string[] } } | null;

export const NOV22_AGENT_LOOP_EXIT_NOTICE_ONE_DECISION_CASES: ReplayCase[] = [
  {
    id: "nov22-b6-fulfilled-notice-never-also-not-fulfilled",
    title: "B6: T1 \"… she gave 2 weeks notice and is fulfilling them …\" (the model passes exit_how notice_not_fulfilled), T6 \"she is resigning due to second job I'm ready for the draft\": the card and the saved form tick Submitted & Fulfilled Notice only",
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
        const firstBack = asks.length - 1 - asks.findIndex((turn) => turn.text.includes("can you make me an exit form"));
        return {
          tool: "propose_form",
          input: {
            template_key: "resignation-exit", employee_id: LOOP_THADDEA.id, exit_type: "resignation",
            exit_evidence: { ...evidenceFrom(view, "can you make me an exit form", firstBack), kind: "asks_for_exit_form" },
            what_happened: "Thaddea gave 2 weeks notice and is fulfilling it; Thaddea is resigning due to a second job.",
            // The live model: the notice box read as "not fulfilled".
            exit_how: "notice_not_fulfilled", exit_how_evidence: evidenceFrom(view, "she gave 2 weeks notice", firstBack),
          },
        };
      });
      t.loopModel!(model);
      const thread = t.thread();
      await thread.say(T1);
      const reply = await thread.say(T6);
      const card = thread.proposal as { exitHow?: string } | null | undefined;
      expect(reply.content, `the card says notice was not fulfilled:\n${reply.content}`).not.toMatch(/Did not fulfill/i);
      expect(card?.exitHow, "the card carries Did not fulfill beside the reader's tick").toBeUndefined();
      const id = await thread.create();
      const checked = t.checked(id);
      expect(checked.resignation_type ?? [], `the saved form ticks Did not fulfill:\n${JSON.stringify(checked)}`).not.toContain("notice_not_fulfilled");
    },
  },
];
