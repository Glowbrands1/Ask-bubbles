import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { caOnFile } from "./nov21-agent-loop-live-retest-u-cases";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * ADDING A PRIOR STEP NEVER REMOVES ONE (QA's ruling on the live regression set, 22 Nov 2026, A13 item 9)
 * ============================================================================
 *
 * The manager's turns word for word (as in `nov22-agent-loop-card-field-change-no-leak`; the person invented): T1
 * "corrective action", T2 "<P full name>" (the card's Prior actions filled from her CA on file, 10/20/2026), T3 "<P> did
 * not acknowledge woven policies by the due date 10/31", T4 "in the previously recieved coaching include that <P full name>
 * signed the jba policy manual on 10-15-26". Live (main 1c71e11, both runs), T4's card read "**Prior actions:** Coaching —
 * Thaddea Kroll signed the JBA policy manual on 10/15/2026, as you said." The model's prior_actions held only the new step,
 * and the CA on file left the card. QA: adding never removes.
 */

const REPORT = "QA's live regression set (22 Nov 2026, A13): T4 \"in the previously recieved coaching include that <P> signed the jba policy manual on 10-15-26\" dropped the on-file \"Corrective Action Form — 10/20/2026\" from Prior actions";
const T = ["corrective action", "Thaddea Kroll", "Thaddea did not acknowledge woven policies by the due date 10/31", "in the previously recieved coaching include that Thaddea Kroll signed the jba policy manual on 10-15-26"];
const ACCOUNT = "Thaddea Kroll did not acknowledge Woven policies by the due date 10/31.";
/** The live model's T4 prior_actions: the new step only. */
const LIVE_T4_PRIOR = "Coaching — Thaddea Kroll signed the JBA Policy Manual on 10/15/2026";
/** Which of the manager's turns (1–4) this call answers, by their own words. */
const users = (view: LoopView) => {
  const said = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
  const index = T.indexOf(said);
  return index >= 0 ? index + 1 : T.length + 1;
};

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
  caOnFile(t, "ca-thaddea-on-file", "Thaddea Kroll", "2026-10-20");
}

type Proposed = { card?: { prior_actions?: string | null } } | null;

const liveModel = () => loopStandIn((view): LoopDecision => {
  const turn = users(view);
  const proposed = lastResult(view, "propose_form") as Proposed;
  if (turn === 1) return { text: "Who is this Corrective Action for?" };
  if (proposed) return { text: `Here's the Corrective Action Form for **Thaddea**.\n\n**Prior actions:** ${proposed.card?.prior_actions ?? ""}` };
  const card = { template_key: "dpoa", employee_name: "Thaddea Kroll", person_evidence: evidenceFrom(view, "Thaddea Kroll", Math.max(0, Math.min(turn, T.length) - 2)) };
  if (turn === 2) return { tool: "propose_form", input: card };
  const account = { ...card, what_happened: ACCOUNT, incident_date: "2026-10-31", policy: headingWith(view, /standards of conduct/i) };
  if (turn === 3) return { tool: "propose_form", input: account };
  return { tool: "propose_form", input: { ...account, prior_actions: LIVE_T4_PRIOR } };
});

/** The card's Prior actions as the latest propose_form result gave them (the card the manager sees). */
const priorOf = (model: { views: LoopView[] }) => (model.views.flatMap((view) => view.results.filter((result) => result.tool === "propose_form")).at(-1)?.output as Proposed | undefined)?.card?.prior_actions ?? "";

export const NOV22_AGENT_LOOP_ADDING_PRIOR_STEP_KEEPS_ON_FILE_CASES: ReplayCase[] = [
  {
    id: "nov22-a13-adding-prior-step-keeps-on-file-line",
    title: "A13 (item 9), under Pau's 23 Nov ruling: the CA on file (10/20/2026) is offered, never added unasked; T4 \"in the previously recieved coaching include that <P> signed the jba policy manual on 10-15-26\" adds the signing (10/15/2026), and Create saves it",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const model = liveModel();
      t.loopModel!(model);
      const thread = t.thread();
      for (const said of T.slice(0, 3)) await thread.say(said);
      /*
       * Changed on purpose (Pau's ruling, 23 Nov 2026, reversing the old f029 behaviour): the AI never puts a form on file
       * on the card's Prior actions by itself. T3's card offers the CA on file (10/20/2026) instead, and the manager here
       * never says yes, so T4 adds the signing only. What this case still guards: the step the manager adds lands, and
       * nothing the manager did not state or accept is added.
       */
      // CHANGED ON PURPOSE (Pau, 26 Nov 2026: "Ai saw prior forms but i need them here"; PRIOR_ON_FILE_ON_CARD_ENABLED, port from the sibling app): forms on file are put on the card's Prior actions by the app, each saying what it is, and never offered. What A13 guards again: adding a step never removes the form on file.
      expect(priorOf(model), "T3's card does not hold the CA on file").toMatch(/finalized — 10\/20\/2026/);
      const reply = await thread.say(T[3]!);
      expect(priorOf(model), `the signing was not added:\n${reply.content}`).toMatch(/10\/15\/2026/);
      expect(priorOf(model), `adding the signing removed the CA on file:\n${reply.content}`).toMatch(/10\/20\/2026/);
      const id = await thread.create();
      const saved = JSON.stringify(t.values(id));
      expect(saved, `the saved form lost the signing:\n${saved}`).toMatch(/10\/15\/2026/);
      expect(saved, `the saved form lost the CA on file:\n${saved}`).toMatch(/10\/20\/2026/);
    },
  },
  {
    id: "nov22-a13-control-on-file-step-restated-listed-once",
    title: "Control: a step the manager restates with the on-file form's own date (10/20/2026) is that form, listed once",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const restated = "Verbal CA — 10/20/2026";
      const model = loopStandIn((view): LoopDecision => {
        const turn = users(view);
        const proposed = lastResult(view, "propose_form") as Proposed;
        if (turn === 1) return { text: "Who is this Corrective Action for?" };
        if (proposed) return { text: "Here's the Corrective Action Form for **Thaddea**." };
        const card = { template_key: "dpoa", employee_name: "Thaddea Kroll", person_evidence: evidenceFrom(view, "Thaddea Kroll", Math.max(0, Math.min(turn, T.length) - 2)) };
        if (turn === 2) return { tool: "propose_form", input: card };
        const account = { ...card, what_happened: ACCOUNT, incident_date: "2026-10-31", policy: headingWith(view, /standards of conduct/i) };
        if (turn === 3) return { tool: "propose_form", input: account };
        return { tool: "propose_form", input: { ...account, prior_actions: restated } };
      });
      t.loopModel!(model);
      const thread = t.thread();
      for (const said of T.slice(0, 3)) await thread.say(said);
      await thread.say("she had a verbal ca on 10/20/26");
      expect(priorOf(model).match(/10\/20\/2026/g)?.length ?? 0, priorOf(model)).toBe(1);
    },
  },
];
