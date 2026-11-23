import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A FORM THE LIBRARY DOES NOT HAVE IS NEVER SWAPPED SILENTLY (board f099 on the loop; QA's live check of #1095, 23 Nov 2026)
 * ============================================================================
 *
 * QA, live on the loop: "create a store manager interview form for Marnie Holloway" → "Here's the Prescreen / Phone
 * Interview Form for **Marnie**."; with a Coaching card open, "Who is this Prescreen / Phone Interview Form for?". The form
 * the manager asked for (form_asked_evidence, this turn's words) is checked by code against the chosen form's own names:
 * no form answers to it → handed back (form_not_in_library: the reply says so and lists the forms); another library form
 * answers to it → that form (form_asked_is_another); offered in its place only when said (instead_of_asked). The stand-in
 * proposes the Prescreen form, as the live model did. The cases hold before and after the management interviews are
 * unhidden (coder 1): either the reply says there's no such form, or the card is the form the manager named; never a
 * silent swap. The person invented (`LOOP_STAFF`).
 */

const REPORT = "Board f099 on the loop (QA's live check of #1095, 23 Nov 2026): \"create a store manager interview form for <P>\" silently made a Prescreen / Phone Interview Form card";
const ASKED = "store manager interview form";
const NO_SUCH = /There's no store manager interview form in the forms library\. The forms you can create are .+\. Which one do you want\?$/;

type Out = { reason_code?: string; template_key?: string; ask_exactly?: string; card?: unknown; facts?: { instead_of_asked?: { say_exactly?: string } } } | null;

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

/** The model as live: the Prescreen form for the interview asked for; on a hand-back it follows it as the rules book says. */
function model(said: string, insteadOfAsked = false) {
  return loopStandIn((view: LoopView): LoopDecision => {
    const result = lastResult(view, "propose_form") as Out;
    const users = view.turns.filter((turn) => turn.role === "user").length;
    if (users === 1 && said !== view.turns.at(-1)?.text) {
      if (result) return { text: "Here's the card." };
      return { tool: "propose_form", input: { template_key: "coaching", employee_id: LOOP_FENNA.id, person_evidence: evidenceFrom(view, "Fenna Prewitt"), what_happened: "Fenna was late to her shift on 11/20/26.", form_asked_evidence: evidenceFrom(view, "coaching form") } };
    }
    if (result?.reason_code === "form_not_in_library") return { text: result.ask_exactly ?? "" };
    if (result?.reason_code === "form_asked_is_another") {
      if (view.results.filter((entry) => entry.tool === "propose_form").length > 1) return { text: "Here's the card." };
      return { tool: "propose_form", input: { template_key: result.template_key, employee_id: LOOP_FENNA.id, person_evidence: evidenceFrom(view, "Fenna Prewitt"), form_asked_evidence: evidenceFrom(view, ASKED) } };
    }
    if (result) return { text: `Here's the card.${result.facts?.instead_of_asked?.say_exactly ? ` ${result.facts.instead_of_asked.say_exactly}` : ""}` };
    return {
      tool: "propose_form",
      input: { template_key: "prescreen-phone-interview", employee_id: LOOP_FENNA.id, person_evidence: evidenceFrom(view, "Fenna Prewitt"), form_asked_evidence: evidenceFrom(view, ASKED), ...(insteadOfAsked ? { instead_of_asked: true } : {}) },
    };
  });
}

/** Never a silent swap: the reply says there's no such form, or the card is the form the manager named. */
function noSilentSwap(content: string, card: { templateName?: string } | null | undefined) {
  if (NO_SUCH.test(content)) {
    expect(card?.templateName ?? "", `a card was made in place of the form asked for:\n${content}`).not.toMatch(/Prescreen/);
    return;
  }
  expect(card?.templateName ?? "", `the reply neither says there's no such form nor makes the form asked for:\n${content}`).toMatch(/store manager interview/i);
}

export const NOV23_AGENT_LOOP_F099_FORM_NOT_IN_LIBRARY_CASES: ReplayCase[] = [
  {
    id: "nov23-loop-f099-store-manager-interview-no-silent-swap",
    title: "f099 on the loop: \"create a store manager interview form for Fenna Prewitt\", the model choosing the Prescreen form: never a silent swap",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const said = "create a store manager interview form for Fenna Prewitt";
      t.loopModel!(model(said));
      const thread = t.thread();
      const reply = await thread.say(said);
      noSilentSwap(reply.content, reply.formProposal as { templateName?: string } | null);
    },
  },
  {
    id: "nov23-loop-f099-open-coaching-card-no-silent-swap",
    title: "f099 on the loop: a Coaching card open, \"can you make a store manager interview form\": never a silent swap; the Coaching card is not replaced",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const said = "can you make a store manager interview form";
      t.loopModel!(model(said));
      const thread = t.thread();
      await thread.say("create a coaching form for Fenna Prewitt, she was late to her shift on 11/20/26");
      expect((thread.proposal as { templateKey?: string } | undefined)?.templateKey, "the Coaching card did not open (the case proves nothing)").toBe("coaching");
      const reply = await thread.say(said);
      noSilentSwap(reply.content, reply.formProposal as { templateName?: string } | null);
    },
  },
  {
    id: "nov23-loop-f099-instead-of-asked-said",
    title: "f099 on the loop: the Prescreen form offered in place of the form asked for (instead_of_asked): the card is made and the reply says so",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const said = "create a store manager interview form for Fenna Prewitt";
      t.loopModel!(model(said, true));
      const reply = await t.thread().say(said);
      if (/store manager interview/i.test((reply.formProposal as { templateName?: string } | null)?.templateName ?? "")) return; // the form exists now: it is the card
      expect(reply.content, reply.content).toMatch(/There's no store manager interview form in the forms library, so this is the Prescreen \/ Phone Interview Form instead\./);
    },
  },
  {
    id: "nov23-loop-f099-control-named-form-kept",
    title: "Control: \"create a coaching form for Fenna Prewitt, …\" with form_asked_evidence naming it: the Coaching card, as before",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(model("never said"));
      const thread = t.thread();
      const reply = await thread.say("create a coaching form for Fenna Prewitt, she was late to her shift on 11/20/26");
      expect((thread.proposal as { templateKey?: string } | undefined)?.templateKey, reply.content).toBe("coaching");
    },
  },
  /*
   * QA (23 Nov 2026): most requests name no form's title. Each everyday wording below still gets its normal card, even with
   * the model passing form_asked_evidence for it (the worst case): only a quote that reads as a form's title is checked.
   */
  ...([
    ["write-her-up", "write her up, Fenna Prewitt was late to her shift on 11/20/26", "dpoa", "write her up"],
    ["coach-him", "coach Fenna Prewitt on this, she was late to her shift on 11/20/26", "coaching", "coach Fenna Prewitt on this"],
    ["exit-for", "exit for Fenna Prewitt, she resigned and her last day was 11/20/26", "resignation-exit", "exit for Fenna Prewitt"],
    ["do-a-ca", "do a CA for Fenna Prewitt, she was late to her shift on 11/20/26", "dpoa", "do a CA"],
    ["verbal-for", "verbal for Fenna Prewitt, she was late to her shift on 11/20/26", "dpoa", "verbal for Fenna Prewitt"],
    ["she-quit-paperwork", "Fenna Prewitt quit, do the paperwork, her last day was 11/20/26", "resignation-exit", "do the paperwork"],
  ] as const).map(([key, said, templateKey, quote]): ReplayCase => ({
    id: `nov23-loop-f099-everyday-${key}`,
    title: `Control: "${said}" (no form's title), with form_asked_evidence "${quote}": the ${templateKey} card as before, never "no such form"`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const standIn = loopStandIn((view: LoopView): LoopDecision => {
        const result = lastResult(view, "propose_form") as Out;
        if (result) return { text: result.ask_exactly ?? "Here's the card." };
        return {
          tool: "propose_form",
          input: {
            template_key: templateKey, employee_id: LOOP_FENNA.id, person_evidence: evidenceFrom(view, "Fenna Prewitt"), form_asked_evidence: evidenceFrom(view, quote),
            ...(templateKey === "resignation-exit" ? { exit_type: "resignation", exit_evidence: { ...evidenceFrom(view, quote), kind: "asks_for_exit_form" } } : { what_happened: "Fenna was late to her shift on 11/20/26." }),
          },
        };
      });
      t.loopModel!(standIn);
      const thread = t.thread();
      const reply = await thread.say(said);
      const codes = standIn.views.flatMap((view) => view.results).map((entry) => String((entry.output as { reason_code?: unknown }).reason_code ?? ""));
      expect(codes.filter((code) => code.startsWith("form_not_in_library") || code === "form_asked_is_another"), reply.content).toEqual([]);
      expect(reply.content, reply.content).not.toMatch(/in the forms library/);
      expect((thread.proposal as { templateKey?: string } | undefined)?.templateKey, `no ${templateKey} card:\n${reply.content}`).toBe(templateKey);
    },
  })),
];
