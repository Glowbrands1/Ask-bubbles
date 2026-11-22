import { expect, vi } from "vitest";

import { STEP_LIMIT_REPLY } from "@/lib/ai/agent-loop/replies";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A LOOP STEP CUT WHILE THINKING IS ASKED AGAIN WITH ITS TOOLS (QA's live regression set, 22 Nov 2026, item 4)
 * ============================================================================
 *
 * The manager's turns word for word (as in `nov22-agent-loop-exit-claims-only-saved`; the person invented): T1 "can you
 * make me an exit form for <P> …", then T5 "last day worked will be nov 23, notice was given last Monday, eligible for
 * rehire, notice will be attached, leave address blank I will fill it in". Live (main 1c71e11), T5 answered "I couldn't
 * finish that in the steps I have for one message. Could you tell me the one thing you want done first?". The turn's
 * trace: the first model call ended "length" at 2048 output tokens with no text and no tool call (adaptive thinking spent
 * the step's whole output budget), and the truncation retry, asked without tools, ended with no text: two model calls,
 * no tool run, the step-limit reply. The same seen on the reply step after a card (U26, U22 T1) and A1's T3.
 *
 * The stand-in plays that: T5's first call is cut with nothing written; the next call, offered the tools, proposes the
 * card. On main the retry has no tools, so the call is never run and the reply is STEP_LIMIT_REPLY.
 */

const REPORT = "QA's live regression set (22 Nov 2026, item 4): T5 \"last day worked will be nov 23, … leave address blank I will fill it in\" answered \"I couldn't finish that in the steps I have for one message\"; the first call was cut at the output limit while thinking, and the retry had no tools";
const T1 = "can you make me an exit form for Thaddea she is in woven under Thaddea Kroll. Her last day is nov 23 she is returning her key she gave 2 weeks notice and is fulfilling them. no deduction at this time";
const T5 = "last day worked will be nov 23, notice was given last Monday, eligible for rehire, notice will be attached, leave address blank I will fill it in";
const REHIRE = "**Is this employee eligible for rehire?** Yes";

const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";

const propose = (view: LoopView): LoopDecision => {
  const asks = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0);
  const firstBack = asks.length - 1 - asks.findIndex((turn) => turn.text.startsWith("can you make me an exit form"));
  return {
    tool: "propose_form",
    input: {
      template_key: "resignation-exit", employee_id: LOOP_THADDEA.id, exit_type: "resignation",
      exit_evidence: { ...evidenceFrom(view, "can you make me an exit form", firstBack), kind: "asks_for_exit_form" },
      what_happened: "Thaddea gave 2 weeks notice and is fulfilling it.",
      payroll_deduct: "no", payroll_evidence: evidenceFrom(view, "no deduction at this time", firstBack),
    },
  };
};

/** `cutOn`: the turn whose first model call is cut at the output limit with nothing written (live: thinking). */
const live = (cutOn: string) => {
  /* Counted here: a retry's prompt leaves the cut call out, so the view's own step reads 0 again. */
  let cut = false;
  return loopStandIn((view): LoopDecision => {
    const result = lastResult(view, "propose_form") as { card?: { reads_back?: string[] } } | null;
    if (result) return { text: ["Here's the Resignation/Exit Form for **Thaddea**.", ...(result.card?.reads_back ?? [])].join("\n\n") };
    if (said(view) === cutOn && !cut) {
      cut = true;
      return { text: "", cut: true };
    }
    return propose(view);
  });
};

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

export const NOV22_AGENT_LOOP_STEP_CUT_WHILE_THINKING_CASES: ReplayCase[] = [
  {
    id: "nov22-step-cut-while-thinking-is-asked-again-with-tools",
    title: "Item 4: T5 \"last day worked will be nov 23, … eligible for rehire, … leave address blank I will fill it in\" whose first model call is cut while thinking (no text, no tool call): the step is asked again with its tools, the card holds rehire Yes, and the reply is never the step-limit reply",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const model = live(T5);
      /* An app condition (a step cut at the output limit), played by the stand-in in live runs too. */
      t.loopModel!(model, { scripted: true });
      const thread = t.thread();
      await thread.say(T1);
      const views = model.views.length;
      const reply = await thread.say(T5);
      expect(reply.content, "T5 ended at the step limit").not.toBe(STEP_LIMIT_REPLY);
      expect(reply.content, `T5's reply:\n${reply.content}`).not.toMatch(/couldn't finish that in the steps/);
      /* What Create saves: the card proposed this turn lists the rehire answer, and the saved draft holds it. */
      const readBack = model.views.slice(views).map((view) => lastResult(view, "propose_form") as { card?: { reads_back?: string[] } } | null).filter(Boolean).at(-1)?.card?.reads_back ?? [];
      expect(readBack, `T5 made no card holding the rehire answer:\n${readBack.join("\n")}`).toContain(REHIRE);
      expect(reply.content).toContain(REHIRE);
      const id = await thread.create();
      expect(t.checked(id).eligible_for_rehire ?? [], `the saved draft: ${JSON.stringify(t.checked(id))}`).toEqual(["yes"]);
    },
  },
  {
    id: "nov22-step-cut-mid-reply-is-rewritten-without-tools",
    title: "Control (TRUNCATION_RETRY, parity gap #36): a reply cut mid-text after the card is written again without tools, so propose_form is never called twice",
    report: `${REPORT}; the cut-reply retry stays as it was`,
    status: "fixed",
    async run(t) {
      start(t);
      let proposed = 0;
      let replies = 0;
      const model = loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form");
        if (!result) {
          proposed += 1;
          return propose(view);
        }
        /* The first reply after the card is cut mid-sentence; the retry writes it whole. */
        replies += 1;
        return replies === 1 ? { text: "Here's the Resignation/Exit Form for", cut: true } : { text: "Here's the Resignation/Exit Form for **Thaddea**." };
      });
      /* An app condition (a step cut at the output limit), played by the stand-in in live runs too. */
      t.loopModel!(model, { scripted: true });
      const thread = t.thread();
      const reply = await thread.say(T1);
      expect(proposed, "propose_form was called again by the retry").toBe(1);
      expect(reply.content).toMatch(/^Here's the Resignation\/Exit Form for \*\*Thaddea\*\*\./);
      expect(thread.proposal?.employeeName).toBe("Thaddea Kroll");
    },
  },
];
