import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * "MAKE THE EXIT FORM FOR <B> INSTEAD OF <A>" MAKES <B>'S EXIT CARD (port from the sibling app; production there, 26 Nov 2026)
 * ============================================================================
 *
 * Found in the sibling app, the same code here. A manager's chat, word for word but for the people (the people invented, `loop-roster.ts`: <A> Fenna Prewitt, <B> Thaddea Kroll):
 * "exit form for <A>" drew <A>'s Resignation/Exit Form card; then "make the exit form for <B> instead of <A-first>"
 * answered "I'm unable to carry this through right now — the system expects an account from <A>'s original card to
 * transfer onto <B>'s, but no such account was ever given (exit forms don't need one)."
 *
 * Cause: U21's hand-back (`same_card_account_missing`) asked the model for the earlier card's account (its
 * Observation) whenever same_card_evidence named another person, for every form. An exit form has no account, so the
 * model had nothing to send and the card never came. The hand-back is for the account forms only.
 */

const FLAG = "AGENT_LOOP_ENABLED";
const REPORT = "Port from the sibling app (production there, 26 Nov 2026): \"make the exit form for <B> instead of <A>\" refused — \"the system expects an account from <A>'s original card to transfer\" (exit forms have none)";
const T1 = "exit form for fenna prewitt";
const T2 = "make the exit form for Thaddea Kroll instead of Fenna";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-26T14:50:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";

export const NOV26_AGENT_LOOP_EXIT_FORM_INSTEAD_OF_CASES: ReplayCase[] = [
  {
    id: "nov26-exit-form-instead-of-other-person",
    title: "\"exit form for <A>\", then \"make the exit form for <B> instead of <A>\" — <B>'s exit card, never asked for an account the exit form does not have",
    report: REPORT,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      if (!t.loopOn?.()) return;
      start(t);
      const thread = t.thread();
      const model = loopStandIn((view): LoopDecision => {
        const message = said(view);
        const last = lastResult(view, "propose_form") as { reason_code?: string } | null;
        if (last) return { text: last.reason_code ? `I'm unable to carry this through right now (${last.reason_code}).` : "Here's the Resignation/Exit Form." };
        if (message === T1) {
          return { tool: "propose_form", input: { template_key: "resignation-exit", exit_evidence: { ...evidenceFrom(view), kind: "asks_for_exit_form" }, employee_id: LOOP_FENNA.id, person_evidence: evidenceFrom(view, "fenna prewitt") } };
        }
        return {
          tool: "propose_form",
          input: {
            template_key: "resignation-exit",
            exit_evidence: { ...evidenceFrom(view), kind: "asks_for_exit_form" },
            employee_id: LOOP_THADDEA.id,
            person_evidence: evidenceFrom(view, "Thaddea Kroll"),
            same_card_evidence: { ...evidenceFrom(view, T2), kind: "this_card_for" },
          },
        };
      });
      t.loopModel!(model);
      await thread.say(T1);
      expect(thread.proposal?.employeeName, "the case proves nothing: A's exit card never came").toBe("Fenna Prewitt");
      await thread.say(T2);
      const codes = model.views.map((view) => (lastResult(view, "propose_form") as { reason_code?: string } | null)?.reason_code).filter(Boolean);
      expect(codes, "the exit card was handed back for an account an exit form does not have").not.toContain("same_card_account_missing");
      expect(thread.proposal?.employeeName, "B's exit card was not made").toBe("Thaddea Kroll");
    },
  },
];
