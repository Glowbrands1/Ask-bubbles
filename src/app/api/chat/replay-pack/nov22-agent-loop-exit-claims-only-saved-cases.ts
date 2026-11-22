import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * AN EXIT REPLY CLAIMS ONLY WHAT IS SAVED (QA's Bubbles live re-run 2, 22 Nov 2026, B6)
 * ============================================================================
 *
 * QA's live re-run on production f9461c1, the manager's turns word for word (names invented): T1 "can you make me an exit
 * form for <P1> she is in woven under <P2>. Her last day is nov 23 she is returning her key she gave 2 weeks notice and is
 * fulfilling them. no deduction at this time", T5 "last day worked will be nov 23, notice was given last Monday, eligible
 * for rehire, notice will be attached, leave address blank I will fill it in", T6 "she is resigning due to second job I'm
 * ready for the draft".
 *
 *   (b) T5's reply: "Eligible for rehire and the notice being attached aren't fields I can set from here", while Create
 *       saved eligible_for_rehire = yes (the draft runs the exit form's own Details reader over the manager's words, and
 *       the card's reads_back never listed what it saves).
 *   (a) T6 called no tool (production's trace: steps []) and replied "Noted the reason — **Reason for Resignation:**
 *       Second job." Nothing reached the card or the saved draft.
 *
 * Mechanism (`agent-loop/exit-read-back.ts`, built on U22): reads_back adds the Details reader's lines under the form's
 * own labels; on a turn with no card call, a reply's exit Details or answer line goes back once ("call propose_form, or
 * don't claim it") and is left out if it comes back.
 */

const REPORT = "QA's Bubbles live re-run 2 (22 Nov 2026, B6): T6's reply said \"Noted the reason — Reason for Resignation: Second job\" with no change saved, and T5's said rehire \"isn't a field I can set\" while Create saved it";
const T1 = "can you make me an exit form for Thaddea she is in woven under Thaddea Kroll. Her last day is nov 23 she is returning her key she gave 2 weeks notice and is fulfilling them. no deduction at this time";
const T5 = "last day worked will be nov 23, notice was given last Monday, eligible for rehire, notice will be attached, leave address blank I will fill it in";
const T6 = "she is resigning due to second job I'm ready for the draft";
const LIVE_T5_TAIL = "Eligible for rehire and the notice being attached aren't fields I can set from here.";
const LIVE_T6 = "Noted the reason — **Reason for Resignation:** Second job.\n\nEverything else on the card stays as above. Go ahead and press **Create draft** when it looks right — I can't press it for you.";
const REHIRE = "**Is this employee eligible for rehire?** Yes";

type Out = { card?: { reads_back?: string[] } } | null;
const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
const handedBack = (view: LoopView) => view.turns.some((turn) => /^\[app check\]/.test(turn.text) && /exit field/.test(turn.text));

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

const propose = (view: LoopView, account: string) => {
  const asks = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0);
  const firstBack = asks.length - 1 - asks.findIndex((turn) => turn.text.startsWith("can you make me an exit form"));
  return {
    tool: "propose_form",
    input: {
      template_key: "resignation-exit", employee_id: LOOP_THADDEA.id, exit_type: "resignation",
      exit_evidence: { ...evidenceFrom(view, "can you make me an exit form", firstBack), kind: "asks_for_exit_form" },
      what_happened: account,
      payroll_deduct: "no", payroll_evidence: evidenceFrom(view, "no deduction at this time", firstBack),
    },
  } as const;
};

/**
 * The live model. T1 and T5: propose_form; T5's reply reads the reads_back it was given, and says rehire can't be set when
 * reads_back does not list it. T6: no tool, the live reply; handed back, it proposes with the reason (`fixes`) or repeats.
 */
const live = (fixes: boolean) =>
  loopStandIn((view): LoopDecision => {
    const message = said(view);
    const result = lastResult(view, "propose_form") as Out;
    const account = message === T6 ? "Thaddea gave 2 weeks notice and is fulfilling it; Thaddea is resigning due to a second job." : "Thaddea gave 2 weeks notice and is fulfilling it.";
    if (message === T6 && !result) return handedBack(view) && fixes ? propose(view, account) : { text: LIVE_T6 };
    if (!result) return propose(view, account);
    const lines = result.card?.reads_back ?? [];
    const rehireListed = lines.some((line) => line === REHIRE);
    return { text: ["Here's the Resignation/Exit Form for **Thaddea**.", ...lines, ...(message === T5 && !rehireListed ? [LIVE_T5_TAIL] : [])].join("\n\n") };
  });

export const NOV22_AGENT_LOOP_EXIT_CLAIMS_ONLY_SAVED_CASES: ReplayCase[] = [
  {
    id: "nov22-b6-rehire-stated-is-read-back-as-saved",
    title: "B6 (b): T5 \"… eligible for rehire, notice will be attached …\" — the exit card's reads_back lists \"Is this employee eligible for rehire? Yes\" (Create saves it), and the reply never says it can't be set",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const model = live(true);
      t.loopModel!(model);
      const thread = t.thread();
      await thread.say(T1);
      const reply = await thread.say(T5);
      const readBack = model.views.map((view) => lastResult(view, "propose_form") as Out).filter(Boolean).at(-1)?.card?.reads_back ?? [];
      expect(readBack, `reads_back does not list the rehire answer Create saves:\n${readBack.join("\n")}`).toContain(REHIRE);
      expect(reply.content, `the reply says rehire can't be set:\n${reply.content}`).not.toMatch(/aren't fields I can set/);
    },
  },
  {
    id: "nov22-b6-no-tool-reason-claim-handed-back",
    title: "B6 (a): T6 \"she is resigning due to second job I'm ready for the draft\" with no tool call and \"Noted the reason — Reason for Resignation: Second job\" — handed back once; the card is proposed with the reason, and the reply reads back what is saved",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const model = live(true);
      t.loopModel!(model);
      const thread = t.thread();
      await thread.say(T1);
      await thread.say(T5);
      const views = model.views.length;
      const reply = await thread.say(T6);
      expect(model.views.slice(views).some(handedBack), "the unsaved reason claim was never handed back").toBe(true);
      expect((thread.proposal as { issue?: string | null } | null)?.issue ?? "", "the reason never reached the card").toMatch(/second job/);
      expect(reply.content).toMatch(/\*\*Reason for Resignation:\*\* /);
    },
  },
  {
    id: "nov22-b6-no-tool-reason-claim-repeated-left-out",
    title: "B6 (a): the model repeating \"Noted the reason — Reason for Resignation: Second job\" with no tool call after the hand-back — that line is left out of the reply, never offered as a change",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(live(false));
      const thread = t.thread();
      await thread.say(T1);
      await thread.say(T5);
      const reply = await thread.say(T6);
      expect(reply.content, `the unsaved reason is still claimed:\n${reply.content}`).not.toMatch(/Reason for Resignation/);
      expect(reply.content).toMatch(/Create draft/);
    },
  },
];
