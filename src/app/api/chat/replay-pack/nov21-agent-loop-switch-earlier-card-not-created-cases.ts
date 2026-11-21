import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_OZREN, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A SWITCHED-FROM CARD THAT WAS NEVER CREATED IS NOT IN THE FORMS REGISTER (ported from the sibling app, QA2, 21 Nov 2026)
 * ============================================================================
 *
 * The sibling app's live test: T1 "ca for <P>, late on 11/18" (a Corrective Action card; Create never pressed), T2 "make
 * it a coaching form": the reply said the earlier card was "left unused unless you'd like it deleted from" the forms
 * page. Nothing was ever created, so nothing is on it. Mechanism, ported: the card says which form it was switched from
 * and whether that form was created (form_changed); with earlier_created false the reply never mentions the Forms
 * Register, deleting it or keeping it unused. A switch away from a created draft still may say the draft is left as it
 * is. QA2's turns, word for word; an invented person (`loop-roster.ts`).
 */

const REPORT = "QA2 (21 Nov 2026), ported from the sibling app's live test: \"make it a coaching form\" after a CA card never created, and the reply said it was \"left unused unless you'd like it deleted\" from the forms page";
const T1 = "ca for Ozren Brack, late on 11/18";
const T2 = "make it a coaching form";
const LIVE_T2 = "Here's the Coaching Form for **Ozren Brack**. The earlier Corrective Action card stays as it is; it's left unused unless you'd like it deleted from the Forms Register.";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T02:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}
type Out = { card?: unknown; facts?: { form_changed?: { from?: string; earlier_created?: boolean } } } | null;
const checkedBack = (view: LoopView) => view.turns.some((turn) => /^\[app check\]/.test(turn.text) && /Forms Register/.test(turn.text));

/** T1: the Corrective Action card. */
async function caCard(t: ReplayContext) {
  const thread = t.thread();
  t.loopModel!(loopStandIn((view): LoopDecision => {
    if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form for **Ozren Brack**." };
    return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_OZREN.id, what_happened: "Late on 11/18.", incident_date: "2026-11-18", policy: headingWith(view, /^attendance/i), person_evidence: evidenceFrom(view, "Ozren Brack") } };
  }));
  await thread.say(T1);
  expect(thread.proposal?.templateKey, "T1 made no Corrective Action card (the case proves nothing)").toBe("dpoa");
  return thread;
}

/** T2: the live model, switching to coaching and writing the live reply until the app hands it back. */
const switchModel = () => loopStandIn((view): LoopDecision => {
  if (!lastResult(view, "propose_form")) return { tool: "propose_form", input: { template_key: "coaching", employee_id: LOOP_OZREN.id, what_happened: "Late on 11/18.", incident_date: "2026-11-18", policy: headingWith(view, /^attendance/i), form_change_evidence: evidenceFrom(view, T2) } };
  return { text: checkedBack(view) ? "Here's the Coaching Form for **Ozren Brack**." : LIVE_T2 };
});

export const NOV21_AGENT_LOOP_SWITCH_EARLIER_CARD_NOT_CREATED_CASES: ReplayCase[] = [
  {
    id: "nov21-switch-earlier-card-never-created-no-forms-register",
    title: "QA2: T1 \"ca for <P>, late on 11/18\" (card, no Create), T2 \"make it a coaching form\": the coaching card says the CA was never created (form_changed earlier_created false), and the reply never mentions the Forms Register or deleting it",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = await caCard(t);
      const model = switchModel();
      t.loopModel!(model);
      const reply = await thread.say(T2);
      expect(thread.proposal?.templateKey, reply.content).toBe("coaching");
      const result = lastResult(model.views.at(-1)!, "propose_form") as Out;
      expect(result?.facts?.form_changed?.earlier_created, `the card does not say the earlier card was never created:\n${JSON.stringify(result?.facts ?? null).slice(0, 600)}`).toBe(false);
      expect(result?.facts?.form_changed?.from ?? "").toMatch(/Corrective Action/);
      expect(reply.content, `the reply speaks of the Forms Register or deleting a card never created:\n${reply.content}`).not.toMatch(/Forms Register|delet|left unused/i);
      expect(reply.content, "the reply lost the coaching card").toMatch(/Coaching Form/);
    },
  },
  {
    id: "nov21-switch-earlier-draft-created-may-say-forms-register",
    title: "Control: T1's CA card is created (a draft exists), then \"make it a coaching form\": form_changed says earlier_created true, and the reply may say the created draft is left as it is in the Forms Register",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = await caCard(t);
      await thread.create();
      const model = switchModel();
      t.loopModel!(model);
      const reply = await thread.say(T2);
      const result = lastResult(model.views.at(-1)!, "propose_form") as Out;
      expect(result?.facts?.form_changed?.earlier_created, `the created draft is not reported as created:\n${JSON.stringify(result).slice(0, 600)}`).toBe(true);
      expect(reply.content, "a true line about a created draft was taken out").toMatch(/Forms Register/);
    },
  },
];
