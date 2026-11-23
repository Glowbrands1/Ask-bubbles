import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A SWITCH TO THE EXIT FORM NEEDS THE SAME EVIDENCE AS ANY FORM CHANGE (QA, 23 Nov 2026: the exit-form lock gap)
 * ============================================================================
 *
 * Since 21 Nov the form lock keeps the card on screen's form unless this turn's words ask for another form, and the quote
 * must name that form (`quoteNamesForm`, the sibling's f108) or answer the app's own offer of it. A switch to the exit form
 * skipped that check: any real quote of this turn passed as exit_evidence was enough. A Corrective Action card on screen
 * plus a message that does not ask for an exit form must never become an exit card. Invented person: the pack's Thaddea.
 */

const REPORT = "QA (23 Nov 2026): the form lock let a switch to the exit form through on any quote of this turn (exit_evidence was checked as a quote only, never that it names the form)";
const T1 = "ca for thaddea kroll, she was late on 11/20";
const ACCOUNT = "Thaddea was late on 11/20.";
const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0);

/** T1: the CA card. T2: the model proposes the exit form, quoting T2 as exit_evidence (`kind`). */
const model = (kind: string) =>
  loopStandIn((view): LoopDecision => {
    const result = lastResult(view, "propose_form") as { card?: { form?: string }; reason_code?: string } | null;
    if (result) return { text: result.card ? `Here's the ${result.card.form ?? "form"} for **Thaddea**.` : `refused: ${result.reason_code}` };
    if (users(view).length === 1) return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_THADDEA.id, what_happened: ACCOUNT, incident_date: "2026-11-20", policy: headingWith(view, /attendance/i), person_evidence: evidenceFrom(view, "thaddea kroll") } };
    const said = users(view).at(-1)!.text;
    return { tool: "propose_form", input: { template_key: "resignation-exit", employee_id: LOOP_THADDEA.id, exit_evidence: { ...evidenceFrom(view, said), kind } } };
  });

async function chat(t: ReplayContext, said: string, kind = "asks_for_exit_form") {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
  t.loopModel!(model(kind));
  const thread = t.thread();
  await thread.say(T1);
  expect(thread.proposal?.templateKey, "T1 made no CA card (the case proves nothing)").toBe("dpoa");
  const reply = await thread.say(said);
  return { thread, reply };
}

export const NOV23_AGENT_LOOP_EXIT_SWITCH_NEEDS_FORM_EVIDENCE_CASES: ReplayCase[] = [
  {
    id: "nov23-exit-switch-not-asked-keeps-ca",
    title: "Exit lock: a CA card on screen and \"she told me she is thinking about quitting\" (no ask for an exit form), with the model passing that as exit_evidence: the card stays the Corrective Action, never an exit card",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread, reply } = await chat(t, "she told me she is thinking about quitting");
      expect(thread.proposal?.templateKey, `the CA became an exit card:\n${reply.content}`).toBe("dpoa");
    },
  },
  {
    id: "nov23-exit-switch-asked-by-name-switches",
    title: "Control: \"make it an exit form instead\" names the exit form, so the card switches to the exit form",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread, reply } = await chat(t, "make it an exit form instead");
      expect(thread.proposal?.templateKey, reply.content).toBe("resignation-exit");
    },
  },
];
