import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * "YES" TO THE LOOP'S OWN "OPEN <P>'S FORM ON FILE?" IS THE MANAGER ASKING FOR <P>'S FORMS (port of the sibling app's
 * bca3bca, its QA's shadow re-run S1(b), 22 Nov 2026)
 * ============================================================================
 *
 * The loop's reply asked "Do you want me to open <P>'s Corrective Action on file?" and the manager's answer, which names
 * nobody, was refused turn after turn ("I need you to confirm the person in your own words"). The forms-on-file person
 * check (`formsOnFileAskedFor`) counted only an earlier MANAGER turn naming the person; it never read the app's own
 * question. Now the app's reply right before the quoted answer, when it names this person, makes the answer about them.
 * A "yes" never opens someone else's forms (the control). Mechanism only; every person invented (`LOOP_STAFF`).
 */

const REPORT = "Port of the sibling app's bca3bca (its QA's shadow re-run S1(b), 22 Nov 2026): the manager's answer to the loop's own \"open <P>'s Corrective Action on file?\" was refused, turn after turn";
const QUESTION = "Do you want me to open Fenna Prewitt's Corrective Action on file?";
const FIRST = "open the ca for the girl who was late friday";

type Found = { forms?: { instance_id?: string }[]; best_match?: string; reason_code?: string };

/** Fenna's Corrective Action on file, as the Forms Register holds it. */
function onFile(t: ReplayContext): string {
  vi.setSystemTime(new Date("2026-11-22T15:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
  const ids = t.templateIds!("dpoa");
  const id = "ca-fenna-late";
  (t.forms() as Record<string, unknown>[]).push({
    id, ...ids, variant_key: null, employee_role: null,
    location_id: WEST_DODGE.primaryAreaId, location_name: "Omaha, West Dodge Rd", created_by: "another-manager", created_by_role: "location_manager",
    source: "ask_sunny", status: "finalized", follow_up_date: null, archived_at: null, revises_instance_id: null,
    template_key: "dpoa", template_name: "Corrective Action Form", employee_name: "Fenna Prewitt", form_date: "2026-11-20",
    created_at: "2026-11-20T15:00:00Z", updated_at: "2026-11-20T15:00:00Z",
  });
  t.typeOnForm(id, { observation: "Fenna was 20 minutes late to open on 11/20/26.", policy_violated: "Attendance" });
  return id;
}

const fixed = (id: string, title: string, body: (t: ReplayContext) => Promise<void>): ReplayCase => ({
  id,
  title,
  report: REPORT,
  status: "fixed",
  async run(t) {
    await body(t);
  },
});

/** M1 names nobody; the loop asks its own question naming Fenna; M2 answers it, and the model looks up `person`'s forms. */
async function answer(t: ReplayContext, reply: string, person = "Fenna Prewitt") {
  const id = onFile(t);
  const model = loopStandIn((view): LoopDecision => {
    const said = view.turns.filter((turn) => turn.role === "user").at(-1)?.text ?? "";
    if (said !== reply) return { text: QUESTION };
    if (!lastResult(view, "find_past_forms")) return { tool: "find_past_forms", input: { employee_name: person, form: "ca", open: true, forms_on_file_evidence: evidenceFrom(view, reply) } };
    return { text: "Opening it." };
  });
  t.loopModel!(model);
  const thread = t.thread();
  await thread.say(FIRST);
  await thread.say(reply);
  return { id, found: lastResult(model.views.at(-1)!, "find_past_forms") as Found };
}

export const NOV22_AGENT_LOOP_YES_TO_OWN_FORMS_QUESTION_CASES: ReplayCase[] = [
  fixed("nov22-yes-to-own-forms-question-opens", `The loop asked "${QUESTION}"; the manager's "yes" is asking for Fenna's forms: found, never privacy_not_this_person`, async (t) => {
    const { id, found } = await answer(t, "yes");
    expect(found.reason_code ?? null, JSON.stringify(found)).not.toBe("privacy_not_this_person");
    expect([found.best_match, ...(found.forms ?? []).map((form) => form.instance_id)], JSON.stringify(found)).toContain(id);
  }),
  fixed("nov22-yes-please-to-own-forms-question-opens", "\"yes please\" to the loop's own question the same way", async (t) => {
    const { found } = await answer(t, "yes please");
    expect(found.reason_code ?? null, JSON.stringify(found)).not.toBe("privacy_not_this_person");
  }),
  fixed("nov22-yes-to-own-forms-question-never-opens-another-person", "Control: after the loop asked about Fenna Prewitt, \"yes\" never opens Ozren Brack's forms (privacy_not_this_person)", async (t) => {
    const { found } = await answer(t, "yes", "Ozren Brack");
    expect(found.reason_code, JSON.stringify(found)).toBe("privacy_not_this_person");
  }),
];
