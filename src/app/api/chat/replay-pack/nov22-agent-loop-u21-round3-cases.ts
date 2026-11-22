import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * U21, QA's LIVE ROUND 3 ON PRODUCTION 1c71e11 (22 Nov 2026): PRIOR STEPS BELONG IN PRIOR ACTIONS, NEVER THE OBSERVATION
 * ============================================================================
 *
 * A long Corrective Action chat (the tester's person invented: Joelle Penrose, on Woven at West Dodge). The tester's
 * turns, word for word. From T3 on the card's Observation held the prior coaching ("<P> received coaching on 9/22 for
 * cleaning tasks not being completed. This weekend …"), and T4 added "JBA Woven policies were acknowledged on 5/26/26." to
 * it: whole sentences, each a prior step the card's Prior actions already listed. Reproduced live with the real model on
 * 1c71e11 (AGENT_LOOP_LIVE=1, 2 of 2 runs). The stand-in writes the account as the live model did.
 */

const REPORT = "QA's live round 3 (22 Nov 2026, U21): the Observation held the prior coaching from T3 on, and T4's policy acknowledgement too; prior actions belong in Prior actions";
const JOELLE: DirectoryRow = { id: "e-joelle-penrose", firstName: "Joelle", lastName: "Penrose", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

export const U21_ROUND3 = {
  T1: "corrective action",
  T2: "joelle penrose",
  T3: "This is what happened: She has recieved coaching on 9/22 for cleaning tasks not being completed. What was observed this weekend is that trash liners were not put into the trash cans after collecting trash, laundry was not done",
  T4: "jba woven policys were acknowledged on 5/26/26",
  T5: "payroll is not deductable",
} as const;

/** The live model's account and prior actions (production 1c71e11, the tester's chat; the name invented). */
const LIVE_ACCOUNT_T3 = "Joelle received coaching on 9/22 for cleaning tasks not being completed. This weekend, trash liners were not put into the trash cans after collecting trash, and laundry was not done.";
const LIVE_ACCOUNT_T4 = `${LIVE_ACCOUNT_T3} JBA Woven policies were acknowledged on 5/26/26.`;

const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").at(-1)?.text ?? "";
const back = (view: LoopView, text: string) => {
  const asks = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0);
  return Math.max(0, asks.length - 1 - asks.findIndex((turn) => turn.text === text));
};

export const NOV22_AGENT_LOOP_U21_ROUND3_CASES: ReplayCase[] = [
  {
    id: "nov22-u21-r3-prior-steps-leave-observation",
    title: "U21 round 3 (T1–T5 verbatim): the prior coaching (T3) and the policy acknowledgement (T4), written by the model as sentences of the account, are on the card's Prior actions and never in its Observation, on the card and in the saved form",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF, JOELLE]);
      t.as("location_manager", WEST_DODGE);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const message = said(view);
        if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form for **Joelle**." };
        if (message === U21_ROUND3.T1) return { text: "Who is this Corrective Action Form for?" };
        if (message === U21_ROUND3.T2) return { text: "What happened with Joelle?" };
        const t4 = view.turns.some((turn) => turn.role === "user" && turn.text === U21_ROUND3.T4);
        /* T5 as live (after the fix too): the account keeps T4's sentence, and the model's prior_actions leave the acknowledgement out. */
        const t5 = view.turns.some((turn) => turn.role === "user" && turn.text === U21_ROUND3.T5);
        return {
          tool: "propose_form",
          input: {
            template_key: "dpoa",
            employee_id: JOELLE.id,
            person_evidence: evidenceFrom(view, "joelle penrose", back(view, U21_ROUND3.T2)),
            policy: headingWith(view, /standards of conduct/i),
            what_happened: t4 ? LIVE_ACCOUNT_T4 : LIVE_ACCOUNT_T3,
            ...(t5 ? { payroll_deduct: "no", payroll_evidence: evidenceFrom(view, U21_ROUND3.T5, back(view, U21_ROUND3.T5)) } : {}),
            prior_actions: t4 && !t5 ? "Coaching — 09/22/2026 (cleaning tasks not being completed); JBA Woven policies acknowledged — 05/26/2026" : "Coaching — 09/22/2026 (cleaning tasks not being completed)",
          },
        };
      }));
      const thread = t.thread();
      const cards: { turn: string; issue: string; prior: string }[] = [];
      for (const turn of Object.values(U21_ROUND3)) {
        await thread.say(turn);
        const card = thread.proposal as { issue?: string; priorActions?: string } | null;
        if (card) cards.push({ turn, issue: card.issue ?? "", prior: card.priorActions ?? "" });
      }
      expect(cards.length, "no card from T3 on").toBeGreaterThanOrEqual(2);
      for (const card of cards) {
        expect(card.issue, `the Observation holds a prior step (${card.turn})`).not.toMatch(/9\/22|5\/26|coaching|acknowledged/i);
        expect(card.issue, "the incident left the Observation").toMatch(/trash liners/);
        expect(card.prior, "the prior coaching left Prior actions").toMatch(/09\/22\/2026/);
      }
      expect(cards.at(-1)!.prior, "T4's acknowledgement is not in Prior actions").toMatch(/05\/26\/2026/);
      /*
       * Create saves the card's Prior actions. (The saved Observation is the drafting model's; this harness's drafting model
       * writes none, so Create's never-blank fallback fills it from the manager's words: not what production's draft does.)
       */
      const id = await thread.create();
      expect(t.values(id).prior_actions ?? "", "the saved Prior actions lost a step").toMatch(/09\/22\/2026[\s\S]*05\/26\/2026/);
    },
  },
];
