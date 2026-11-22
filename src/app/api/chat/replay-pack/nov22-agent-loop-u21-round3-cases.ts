import { expect, vi } from "vitest";

import { type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * U21, QA's LIVE ROUND 3 ON PRODUCTION 1c71e11 (22 Nov 2026): PRIOR STEPS BELONG IN PRIOR ACTIONS, NEVER THE OBSERVATION
 * ============================================================================
 *
 * A long Corrective Action chat on Pau's admin login (all stores), the tester's turns word for word, the tester's invented
 * person: Briony Kask, on Woven at West Dodge. From T3 on the card's Observation held the prior coaching ("<P> received coaching on 9/22 for
 * cleaning tasks not being completed. This weekend …"), and T4 added "JBA Woven policies were acknowledged on 5/26/26." to
 * it: whole sentences, each a prior step the card's Prior actions already listed. Reproduced live with the real model on
 * 1c71e11 (AGENT_LOOP_LIVE=1, 2 of 2 runs). The stand-in writes the account as the live model did.
 */

const REPORT = "QA's live round 3 (22 Nov 2026, U21): the Observation held the prior coaching from T3 on, and T4's policy acknowledgement too; prior actions belong in Prior actions";
const BRIONY: DirectoryRow = { id: "e-briony-kask", firstName: "Briony", lastName: "Kask", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

export const U21_ROUND3 = {
  T1: "corrective action",
  T2: "briony kask",
  T3: "This is what happened: She has recieved coaching on 9/22 for cleaning tasks not being completed. What was observed this weekend is that trash liners were not put into the trash cans after collecting trash, laundry was not done",
  T4: "jba woven policys were acknowledged on 5/26/26",
  T5: "payroll is not deductable",
} as const;

/** The live model's account and prior actions (production 1c71e11, the tester's chat; the name invented). */
const LIVE_ACCOUNT_T3 = "Briony Kask received coaching on 9/22 for cleaning tasks not being completed. This weekend, trash liners were not put into the trash cans after collecting trash, and laundry was not done.";
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
      t.directory([...LOOP_STAFF, BRIONY]);
      t.as("admin", ADMIN);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const message = said(view);
        if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form for **Briony Kask**." };
        if (message === U21_ROUND3.T1) return { text: "Who is this Corrective Action Form for?" };
        if (message === U21_ROUND3.T2) return { text: "Got it, Briony Kask. What happened?" };
        const t4 = view.turns.some((turn) => turn.role === "user" && turn.text === U21_ROUND3.T4);
        /* T5 as live (after the fix too): the account keeps T4's sentence, and the model's prior_actions leave the acknowledgement out. */
        const t5 = view.turns.some((turn) => turn.role === "user" && turn.text === U21_ROUND3.T5);
        return {
          tool: "propose_form",
          input: {
            template_key: "dpoa",
            employee_id: BRIONY.id,
            person_evidence: evidenceFrom(view, "briony kask", back(view, U21_ROUND3.T2)),
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

/** T4 as live: the model dated the card with the prior coaching's day ("The form is currently dated 9/22/2026 (the coaching date)"). */
function formDateRun(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, BRIONY]);
  t.as("admin", ADMIN);
  t.loopModel!(loopStandIn((view): LoopDecision => {
    const message = said(view);
    if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form for **Briony Kask**." };
    if (message === U21_ROUND3.T1) return { text: "Who is this Corrective Action Form for?" };
    if (message === U21_ROUND3.T2) return { text: "Got it, Briony Kask. What happened?" };
    const t4 = view.turns.some((turn) => turn.role === "user" && turn.text === U21_ROUND3.T4);
    return {
      tool: "propose_form",
      input: {
        template_key: "dpoa",
        employee_id: BRIONY.id,
        person_evidence: evidenceFrom(view, "briony kask", back(view, U21_ROUND3.T2)),
        policy: headingWith(view, /standards of conduct/i),
        what_happened: "This weekend, trash liners were not put into the trash cans after collecting trash, and laundry was not done.",
        prior_actions: t4 ? "Policy acknowledgement — 05/26/2026" : "Coaching — 09/22/2026 (cleaning tasks not being completed)",
        ...(t4 ? { incident_date: "2026-09-22" } : {}),
      },
    };
  }));
}

NOV22_AGENT_LOOP_U21_ROUND3_CASES.push({
  id: "nov22-u21-r3-form-date-never-a-prior-step-date",
  title: "U21 round 3 (T1–T4 verbatim): the card's form date is never a prior step's date (live T4: 2026-09-22, the coaching's day)",
  report: `${REPORT}; the tester's card data: T4 formDate 2026-09-22 (the prior coaching), T12 2024-06-24 (the policy signing)`,
  /*
   * QA (22 Nov 2026): form_date handling is coder 1's (session_01VVEkRTNhKWLH8gwuJq8Jfp), whose PR 2 adds "a prior step's
   * date is never the form date". This branch does not touch the form-date logic, so the case is open until that merges.
   */
  status: { open: "the form date takes a prior step's date; coder 1's PR 2 fixes it" },
  async run(t) {
    formDateRun(t);
    const thread = t.thread();
    const dates: (string | null)[] = [];
    for (const turn of Object.values(U21_ROUND3).slice(0, 4)) {
      await thread.say(turn);
      dates.push((thread.proposal as { formDate?: string | null } | null)?.formDate ?? null);
    }
    expect(dates.filter((date) => date === "2026-09-22" || date === "2026-05-26"), `form dates per turn: ${JSON.stringify(dates)}`).toEqual([]);
  },
});
