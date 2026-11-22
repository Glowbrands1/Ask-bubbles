import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE EVIDENCE FOR "YES" TO THE APP'S OWN "… FOR <P>, IS THAT THE ONE YOU MEAN?" (QA's follow-up, 22 Nov 2026, both apps)
 * ============================================================================
 *
 * In 1 of 6 live runs of the sibling's port (#1051), the model found the form by date and asked "I found a Corrective
 * Action Form dated 11/20 for Fenna Prewitt for lateness. Is that the one you mean?"; the manager's "yes please" was then
 * refused as privacy_not_this_person. The model's evidence was not the "yes" but either the manager's earlier request
 * (which names nobody) or the app's own question. Either is the ask now, as long as the person comes from the app's own
 * question right before the manager's answer, in this request. Every person invented (`LOOP_STAFF`).
 */

const REPORT = "QA's follow-up (22 Nov 2026, both apps): \"yes please\" to the app's own \"… for <P> … Is that the one you mean?\" was still refused (1 in 6 live runs of #1051)";
const FIRST = "open the ca for the girl who was late friday";
const QUESTION = "I found a Corrective Action Form dated 11/20 for Fenna Prewitt for lateness. Is that the one you mean?";

type Found = { forms?: { instance_id?: string }[]; best_match?: string; reason_code?: string };

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

/** The app's own question, as the model would quote it: its words, under the id of the manager's message answering it (the app's turns carry no id the model sees). */
function ownQuestion(view: LoopView): { message_id: string; quote: string } {
  return { ...evidenceFrom(view), quote: "for Fenna Prewitt for lateness" };
}

/**
 * M1 names nobody; the app asks its own question naming Fenna; M2 is `reply`. The model then looks up `person`'s forms
 * citing `cite`: the manager's first request, or the app's own question.
 */
async function answer(t: ReplayContext, reply: string, cite: "request" | "question", person = "Fenna Prewitt", between?: string) {
  const id = onFile(t);
  const model = loopStandIn((view): LoopDecision => {
    const said = view.turns.filter((turn) => turn.role === "user").at(-1)?.text ?? "";
    if (said !== reply) return { text: QUESTION };
    if (!lastResult(view, "find_past_forms")) {
      const evidence = cite === "request" ? evidenceFrom(view, FIRST, between ? 2 : 1) : ownQuestion(view);
      return { tool: "find_past_forms", input: { employee_name: person, form: "ca", open: true, forms_on_file_evidence: evidence } };
    }
    return { text: "Opening it." };
  });
  t.loopModel!(model);
  const thread = t.thread();
  await thread.say(FIRST);
  if (between) await thread.say(between);
  await thread.say(reply);
  return { id, found: lastResult(model.views.at(-1)!, "find_past_forms") as Found };
}

const opened = (id: string, found: Found) => {
  expect(found.reason_code ?? null, JSON.stringify(found)).toBeNull();
  expect([found.best_match, ...(found.forms ?? []).map((form) => form.instance_id)], JSON.stringify(found)).toContain(id);
};

const fixed = (id: string, title: string, run: (t: ReplayContext) => Promise<void>): ReplayCase => ({ id, title, report: REPORT, status: "fixed", run });

export const NOV22_AGENT_LOOP_YES_EVIDENCE_FROM_OWN_QUESTION_CASES: ReplayCase[] = [
  fixed("nov22-yes-evidence-cites-earlier-request-opens", `"yes please" to "${QUESTION}", the model citing the manager's earlier request (naming nobody): Fenna's form is found`, async (t) => {
    const { id, found } = await answer(t, "yes please", "request");
    opened(id, found);
  }),
  fixed("nov22-yes-evidence-cites-own-question-opens", `"yes please" to "${QUESTION}", the model citing the app's own question: Fenna's form is found`, async (t) => {
    const { id, found } = await answer(t, "yes please", "question");
    opened(id, found);
  }),
  fixed("nov22-yes-evidence-never-opens-another-person", "Control: after the app's question about Fenna Prewitt, \"yes please\" citing the earlier request never opens Ozren Brack's forms", async (t) => {
    const { found } = await answer(t, "yes please", "request", "Ozren Brack");
    expect(found.reason_code, JSON.stringify(found)).toBe("privacy_not_this_person");
  }),
  fixed("nov22-yes-evidence-other-person-named-between-stays-closed", "Control: a manager turn naming someone else between the cited request and the answer keeps Fenna's forms closed on the earlier request's evidence", async (t) => {
    const { found } = await answer(t, "yes please", "request", "Fenna Prewitt", "actually what about ozren brack");
    expect(found.reason_code, JSON.stringify(found)).toBe("privacy_not_this_person");
  }),
];

/*
 * The tester's turn order, for a LIVE run that reaches the fix (QA, 22 Nov 2026): the manager asks for the form by its
 * date without a name; the app finds it on file and asks its own "… for <P> … Is that the one you mean?"; the manager
 * answers "yes please". With the stand-in, the model cites the manager's earlier request (as the live run did); live,
 * the real model plays both turns. A run whose reply never asked about Fenna proves nothing and says so.
 */
const BY_DATE = "pull up the ca from friday 11/20 for the girl who was late to open, i don't remember her name";

async function tellByDate(t: ReplayContext) {
  const id = onFile(t);
  const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").length;
  const model = loopStandIn((view): LoopDecision => {
    const found = lastResult(view, "find_past_forms") as (Found & { forms?: { employee?: string }[] }) | null;
    if (users(view) === 1) {
      if (!found) return { tool: "find_past_forms", input: { form: "ca", date_from: "2026-11-20", date_to: "2026-11-20", forms_on_file_evidence: evidenceFrom(view, BY_DATE) } };
      return { text: `I found a Corrective Action Form dated 11/20 for ${found.forms?.[0]?.employee ?? "nobody"} for lateness. Is that the one you mean?` };
    }
    if (!found) return { tool: "find_past_forms", input: { employee_name: "Fenna Prewitt", form: "ca", open: true, forms_on_file_evidence: evidenceFrom(view, "pull up the ca from friday 11/20", 1) } };
    return { text: "Opening it." };
  });
  t.loopModel!(model);
  const thread = t.thread();
  const asked = await thread.say(BY_DATE);
  const answered = await thread.say("yes please");
  const second = model.views.filter((view) => users(view) === 2).flatMap((view) => view.results);
  return { id, asked: asked.content, answered, second };
}

export const NOV22_AGENT_LOOP_YES_EVIDENCE_TESTER_ORDER_CASES: ReplayCase[] = [
  {
    id: "nov22-yes-evidence-tester-order-yes-please-opens",
    title: `The tester's turn order: "${BY_DATE}", the app asks "… for Fenna Prewitt … Is that the one you mean?", "yes please" opens Fenna's form and is never refused as about someone else`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { id, asked, answered, second } = await tellByDate(t);
      expect(asked, `the reply never asked about Fenna, so this run proves nothing:\n${asked}`).toMatch(/Fenna/);
      const refused = second.filter((result) => /^privacy_/.test(String((result.output as { reason_code?: unknown }).reason_code ?? "")));
      expect(refused.map((result) => `${result.tool}: ${JSON.stringify(result.output).slice(0, 200)}`), answered.content).toEqual([]);
      const reached = second.some((result) => JSON.stringify(result.output).includes(id)) || answered.formOpened?.instanceId === id;
      expect(reached, `"yes please" did not reach Fenna's form:\n${answered.content}`).toBe(true);
    },
  },
];
