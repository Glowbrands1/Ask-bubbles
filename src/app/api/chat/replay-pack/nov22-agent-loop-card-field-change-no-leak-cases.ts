import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { caOnFile } from "./nov21-agent-loop-live-retest-u-cases";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A CHANGE TO A FIELD THE CARD SHOWS GOES ON THE CARD, AND THE REPLY NEVER SHOWS THE MODEL'S REASONING (A13)
 * ============================================================================
 *
 * QA's Bubbles live re-run (22 Nov 2026, A13), the manager's turns word for word (the person invented): T1 "corrective
 * action", T2 "<P full name>" (the card's Prior actions filled from forms on file), T3 "<P> did not acknowledge woven
 * policies by the due date 10/31", T4 "in the previously recieved coaching include that <P full name> signed the jba
 * policy manual on 10-15-26". Live: T4 was not applied; the reply leaked "The manager's request to add this is about the
 * card on screen (the open draft), not an older form on file." and asked whether the change was for the card or a form
 * on file. Now: the rules book has the card changed (propose_form again, the card's entries kept and the step added),
 * and a reply sentence speaking of "the manager" goes back once and is then left out (`agent-loop/reasoning-leak.ts`).
 */

const REPORT = "QA's Bubbles live re-run (22 Nov 2026, A13): T4's \"include\" on the card's Prior actions was not applied, and the reply showed the model's reasoning";
const T = ["corrective action", "Thaddea Kroll", "Thaddea did not acknowledge woven policies by the due date 10/31", "in the previously recieved coaching include that Thaddea Kroll signed the jba policy manual on 10-15-26"];
const ACCOUNT = "Thaddea Kroll did not acknowledge Woven policies by the due date 10/31.";
const LEAK = "The manager's request to add this is about the card on screen (the open draft), not an older form on file.";
const RULE = /never ask whether it is for the card or a form on file/;
const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").length;
const checkedBack = (view: LoopView) => view.turns.some((turn) => /^\[app check\]/.test(turn.text) && /third person/.test(turn.text));

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
  caOnFile(t, "ca-thaddea-on-file", "Thaddea Kroll", "2026-10-20");
}

/** `leakFixes`: whether the model's second reply drops the reasoning sentence. */
const live = (leakFixes: boolean) => {
  let cardPrior = "";
  return loopStandIn((view): LoopDecision => {
    const turn = users(view);
    const proposed = lastResult(view, "propose_form") as { card?: { prior_actions?: string | null } } | null;
    if (turn === 1) return { text: "Who is this Corrective Action for?" };
    const card = { template_key: "dpoa", employee_name: "Thaddea Kroll", person_evidence: evidenceFrom(view, "Thaddea Kroll", turn === 2 ? 0 : turn - 2) };
    if (turn === 2) return proposed ? { text: "What happened?" } : { tool: "propose_form", input: card };
    const account = { ...card, what_happened: ACCOUNT, incident_date: "2026-10-31", policy: headingWith(view, /standards of conduct/i) };
    if (turn === 3) {
      if (proposed) {
        cardPrior = proposed.card?.prior_actions ?? "";
        return { text: "Here's the Corrective Action Form for **Thaddea**." };
      }
      return { tool: "propose_form", input: account };
    }
    if (!RULE.test(view.system)) return { text: `${LEAK} Is this change for the card on screen, or for one of the forms already on file?` };
    if (!proposed) return { tool: "propose_form", input: { ...account, prior_actions: [cardPrior, "Signed the JBA Policy Manual — 10/15/2026"].filter(Boolean).join("; ") } };
    return { text: checkedBack(view) && leakFixes ? "Added to Prior actions: signed the JBA Policy Manual on 10/15/2026." : `${LEAK} Added to Prior actions: signed the JBA Policy Manual on 10/15/2026.` };
  });
};

type Model = ReturnType<typeof live>;
/** The card's Prior actions as the latest propose_form result gave them. */
const priorOf = (model: Model) =>
  ((model.views.flatMap((view) => view.results.filter((result) => result.tool === "propose_form")).at(-1)?.output as { card?: { prior_actions?: string | null } } | undefined)?.card?.prior_actions ?? "");

async function chat(t: ReplayContext, leakFixes: boolean) {
  start(t);
  const model = live(leakFixes);
  t.loopModel!(model);
  const thread = t.thread();
  for (const said of T.slice(0, 3)) await thread.say(said);
  expect(thread.proposal?.templateKey, "T3 made no Corrective Action card (the case proves nothing)").toBe("dpoa");
  const reply = await thread.say(T[3]!);
  return { thread, reply, model };
}

export const NOV22_AGENT_LOOP_CARD_FIELD_CHANGE_NO_LEAK_CASES: ReplayCase[] = [
  {
    id: "nov22-a13-include-on-card-prior-actions",
    title: "A13: T4 \"in the previously recieved coaching include that <P> signed the jba policy manual on 10-15-26\" with the CA card on screen: the signing is added to the card's Prior actions (propose_form again); no card-or-file question",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { reply, model } = await chat(t, true);
      expect(priorOf(model), `the signing was not added to the card:\n${reply.content}`).toMatch(/10\/15\/2026/);
      expect(reply.content, "the reply asks card-or-file").not.toMatch(/forms? already on file/i);
    },
  },
  {
    id: "nov22-a13-reply-reasoning-handed-back",
    title: "A13: a reply that speaks of \"the manager\" in the third person (\"The manager's request to add this is about the card on screen …\") goes back once; the reply has no reasoning",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { reply } = await chat(t, true);
      expect(reply.content, `the model's reasoning reached the manager:\n${reply.content}`).not.toMatch(/the manager/i);
      expect(reply.content).toMatch(/Added to Prior actions/);
    },
  },
  {
    id: "nov22-a13-reply-reasoning-left-out-when-repeated",
    title: "A13: the model repeats the reasoning sentence after the hand-back: that sentence is left out, the rest of the reply stays",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { reply } = await chat(t, false);
      expect(reply.content, `the model's reasoning reached the manager:\n${reply.content}`).not.toMatch(/the manager/i);
      expect(reply.content).toMatch(/Added to Prior actions/);
    },
  },
];
