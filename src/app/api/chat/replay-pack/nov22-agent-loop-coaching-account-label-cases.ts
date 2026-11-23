import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * A COACHING CARD'S ACCOUNT IS LABELLED WITH THE FORM'S OWN LABEL (port of the sibling app's #1241, cd69c6c)
 * ============================================================================
 *
 * In the sibling app, a Coaching Form card read "**Observation of Offense:** Coaching on how to …": a Corrective
 * Action's label on a Coaching Form, whose field is "Details of Coaching". This app's rules book has the identical line,
 * giving every incident card the label "Observation of Offense". propose_form's card (and the team Coaching card) now
 * carries account_label, the label of the form's own account field read from its template, and the rules book has the
 * model use it. Mechanism only; the person invented (`LOOP_STAFF`).
 */

const REPORT = "Port of the sibling app's #1241 (its 266-chat run, cases 039 and 241): a Coaching Form card read \"**Observation of Offense:** Coaching on …\"";

type Out = { card?: { observation?: string | null; account_label?: string | null } } | null;

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

/** The model writes the account line as the rules book has it: the card's own label, then the account. */
function model(templateKey: "coaching" | "dpoa") {
  return loopStandIn((view): LoopDecision => {
    const result = lastResult(view, "propose_form") as Out;
    if (result) return { text: `Here's the card for **Fenna**.\n**${result.card?.account_label ?? "Observation of Offense"}:** ${result.card?.observation ?? ""}` };
    return {
      tool: "propose_form",
      input: templateKey === "coaching"
        ? { template_key: "coaching", employee_id: LOOP_FENNA.id, what_happened: "Fenna was coached on restocking the soap shelf before close on 11/21/26.", person_evidence: evidenceFrom(view, "Fenna Prewitt") }
        : { template_key: "dpoa", employee_id: LOOP_FENNA.id, what_happened: "Fenna did not restock the soap shelf before close on 11/21/26.", person_evidence: evidenceFrom(view, "Fenna Prewitt") },
    };
  });
}

const labelOf = (standIn: ReturnType<typeof model>) => (standIn.views.flatMap((view) => view.results.filter((result) => result.tool === "propose_form")).at(-1)?.output as Out)?.card?.account_label;

export const NOV22_AGENT_LOOP_COACHING_ACCOUNT_LABEL_CASES: ReplayCase[] = [
  {
    id: "nov22-coaching-account-label",
    title: "\"create a coaching form for Fenna Prewitt\": the card's account label is Details of Coaching, never Observation of Offense",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const standIn = model("coaching");
      t.loopModel!(standIn);
      const reply = await t.thread().say("create a coaching form for Fenna Prewitt");
      expect(labelOf(standIn), "the coaching card does not carry its own account label").toBe("Details of Coaching");
      expect(reply.content, `the coaching card reads a Corrective Action's label:\n${reply.content}`).not.toMatch(/Observation of Offense/);
    },
  },
  {
    id: "nov22-coaching-account-label-control-ca",
    title: "Control: a Corrective Action card's account label is still Observation of Offense",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const standIn = model("dpoa");
      t.loopModel!(standIn);
      await t.thread().say("create a CA for Fenna Prewitt");
      expect(labelOf(standIn), "the CA card does not carry its own account label").toBe("Observation of Offense");
    },
  },
];
