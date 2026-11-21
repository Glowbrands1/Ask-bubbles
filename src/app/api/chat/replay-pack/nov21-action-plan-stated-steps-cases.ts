import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_OZREN, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * THE ACTION PLAN ADDS THE STEP THE MANAGER ASKED FOR (STATED_PLAN_STEPS_ENABLED; ported from the sibling app, 21 Nov 2026)
 * ============================================================================
 *
 * The sibling app's f062 (Pau via QA, 20 Nov 2026; its live test of a long late-opening account). The manager's one long
 * turn ended "I want this documented as a written corrective action and the opening procedures reviewed with <P> this
 * week." The saved Action Plan was the generic two sentences, "Management will review the <policy> policy with <first>.
 * Future policy violations …", without the step asked for. Pau ("YEAH add"): the standard plan stays exactly, and each
 * step the manager stated is added in their words before the closing; with no step the plan is byte-identical.
 *
 * Mechanism, ported: on the real Create path, on the regular chat (the intent reader's planSteps slot, so with
 * INTENT_EXTRACTION_ENABLED on as well, which is off in this app's production) and on the agent loop (the card's
 * plan_steps with plan_evidence). The account is this app's own (a store opening late), invented; the closing line is
 * the reporter's word for word; the person is the loop roster's invented Ozren Brack (`loop-roster.ts`).
 */

const REPORT = "Ported from the sibling app (QA's live test, 20 Nov 2026, f062): the Action Plan ignored the step the manager asked for";
const OPEN = { open: "STATED_PLAN_STEPS_ENABLED is off in production until QA's live test" };

/** The manager's one turn: an invented store account; the last sentence is the reporter's, word for word. */
const SAID = "CA for Ozren Brack, late opening incident on 11/12. Ozren Brack was scheduled to open the store at 10:00 AM that Thursday. The first guests were waiting outside the front door by 9:55, and they were still waiting at 10:20 because the doors were not unlocked and the lights were off. I got a call from a guest at 10:05 asking if we were closed for the day. I tried calling Ozren Brack twice and texted once, and there was no answer until 10:25, when Ozren Brack replied that the alarm code had been entered wrong, then that the bus was late, and then that the key to the back door was in the other jacket. Ozren Brack finally arrived at 10:38, thirty-eight minutes after the scheduled opening time. During those thirty-eight minutes two guests left without buying, and one guest said she would not come back because this was the second time she had been left waiting outside. This is the third time in two months that Ozren Brack has opened late. The opening checklist was not finished until 11:15. I explained again that opening the store on time is a core part of the job. Ozren Brack said it would not happen again. I want this documented as a written corrective action and the opening procedures reviewed with Ozren Brack this week.";
/** The loop card's account, as a model would write it from the turn (invented). */
const ACCOUNT = "On 11/12, Ozren Brack was scheduled to open the store at 10:00 AM that Thursday. The first guests were waiting outside the front door by 9:55, and they were still waiting at 10:20 because the doors were not unlocked and the lights were off. A guest called at 10:05 asking if the store was closed for the day. Ozren Brack was called twice and texted once, with no answer until 10:25. Ozren Brack finally arrived at 10:38, thirty-eight minutes after the scheduled opening time. Two guests left without buying. This is the third time in two months that Ozren Brack has opened late. The opening checklist was not finished until 11:15. Ozren Brack said it would not happen again.";
const ASKED = "the opening procedures reviewed with Ozren Brack this week";
const STEP = "Review the opening procedures with Ozren this week.";
const OBSERVATION = `Observed:\n${ACCOUNT}\n\nExpectation:\nOzren is expected to open the store on time.`;

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T02:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

/**
 * The chat on one path: the agent loop (its stand-in card) or the regular chat (its scripted intent reader; no loop model,
 * so the loop does not run, as in production for everyone not on the loop).
 */
async function savedPlan(t: ReplayContext, steps: string[] | null, loop: boolean) {
  if (loop) t.loopModel!(loopStandIn((view): LoopDecision => lastResult(view, "propose_form")
    ? { text: "Here's the Corrective Action Form for **Ozren**." }
    : {
        tool: "propose_form",
        input: {
          template_key: "dpoa",
          employee_id: LOOP_OZREN.id,
          person_evidence: evidenceFrom(view, "CA for Ozren Brack"),
          what_happened: ACCOUNT,
          policy: headingWith(view, /^attendance/i),
          incident_date: "2026-11-12",
          warning_level: "written",
          level_evidence: evidenceFrom(view, "documented as a written corrective action"),
          ...(steps ? { plan_steps: steps, plan_evidence: evidenceFrom(view, ASKED) } : {}),
        },
      }));
  t.slotsRead({ employee: "Ozren Brack", warningLevel: "written", incidentDate: "11/12", formType: "Corrective Action Form", formTurn: true, ...(steps ? { planSteps: steps } : {}) });
  t.draftWrites({ observation: OBSERVATION });
  const thread = t.thread();
  const card = await thread.say(SAID);
  expect(thread.proposal?.templateKey, `no Corrective Action card (the case proves nothing):\n${card.content}`).toBe("dpoa");
  const id = await thread.create();
  const saved = (t.values(id).action_plan ?? "").replace(/\s+/g, " ").trim();
  if (!loop) {
    /*
     * The regular chat's card shows its Action Plan line with the same steps Create adds (`withCardPlanSteps`). The line
     * itself is not compared with the saved plan: this pack's stand-in draft saves no policy for this wording, so the saved
     * plan names "the applicable company policy" where the card names its heading (see nov12-17l-card-plan-matches-create).
     */
    const shown = (/\*\*Action plan:\*\*\s*([^\n]+)/i.exec(card.content)?.[1] ?? "").replace(/\s+/g, " ").trim();
    expect(shown, `the card shows no Action Plan line (the case proves nothing):\n${card.content}`).toMatch(/Future policy violations/);
    const stepOnCard = shown.includes(STEP);
    expect(stepOnCard, `the card's plan and the saved plan disagree on the step:\ncard: ${shown}\nsaved: ${saved}`).toBe(saved.includes(STEP));
  }
  return saved;
}

const STEPS = ["review the opening procedures with Ozren Brack this week"];

/**
 * The standard plan for this card with no stated step, as this pack saves it today on both paths (its stand-in draft
 * saves no policy for this account, so the plan names the applicable company policy).
 */
const STANDARD_PLAN = "Management will review the applicable company policy with Ozren. Future policy violations may result in additional corrective action up to and including termination of employment.";

/**
 * The loop path's standard plan names the policies the card cites. Changed on purpose (QA's live re-test, 21 Nov 2026):
 * the pack's knowledge mock now has `officialPolicyManualVersion`, as production's provider does, so the loop reads the
 * manual and its card cites Attendance and Late Opening; the saved plan then names them, as production saves it. Before,
 * the loop read no manual in this pack and the plan fell back to "the applicable company policy".
 */
const LOOP_STANDARD_PLAN = "Management will review the Attendance and Late Opening policies with Ozren. Future policy violations may result in additional corrective action up to and including termination of employment.";

const standardPlan = (loop: boolean) => (loop ? LOOP_STANDARD_PLAN : STANDARD_PLAN);

function expectStepAdded(plan: string, loop: boolean) {
  expect(plan, "no Action Plan was saved (the case proves nothing)").toMatch(/Future policy violations/);
  expect(plan, `the step the manager asked for is not in the plan:\n${plan}`).toContain(STEP);
  expect(plan.indexOf(STEP), `the step is not before the closing:\n${plan}`).toBeLessThan(plan.indexOf("Future policy violations"));
  expect(plan.replace(` ${STEP}`, ""), `the standard plan changed:\n${plan}`).toBe(standardPlan(loop));
}

const INVENTED = ["schedule a follow-up meeting in two weeks"];

const PATHS = [
  { key: "chat", name: "regular chat", loop: false, flags: ["INTENT_EXTRACTION_ENABLED", "STATED_PLAN_STEPS_ENABLED"] },
  { key: "loop", name: "agent loop", loop: true, flags: ["AGENT_LOOP_ENABLED", "STATED_PLAN_STEPS_ENABLED"] },
] as const;

export const NOV21_ACTION_PLAN_STATED_STEPS_CASES: ReplayCase[] = PATHS.flatMap((path): ReplayCase[] => [
  {
    id: `nov21-f062-stated-step-added-${path.key}`,
    title: `f062 (ported), ${path.name}: a long late-opening account ending "… the opening procedures reviewed with <P> this week": the saved plan is the standard plan with "${STEP}" before the closing`,
    report: REPORT,
    status: OPEN,
    fixFlags: [...path.flags],
    async run(t) {
      start(t);
      expectStepAdded(await savedPlan(t, STEPS, path.loop), path.loop);
    },
  },
  {
    id: `nov21-f062-no-step-plan-byte-identical-${path.key}`,
    title: `f062 control (ported), ${path.name}: the same account with no step read: the saved plan is the standard plan, byte for byte, with the flag off or on`,
    report: REPORT,
    status: "fixed",
    fixFlags: [...path.flags],
    async run(t) {
      start(t);
      expect(await savedPlan(t, null, path.loop)).toBe(standardPlan(path.loop));
    },
  },
  {
    id: `nov21-f062-invented-step-never-added-${path.key}`,
    title: `f062 (ported), ${path.name}: a step the manager never asked for ("${INVENTED[0]}") is never added`,
    report: REPORT,
    status: "fixed",
    fixFlags: [...path.flags],
    async run(t) {
      start(t);
      expect(await savedPlan(t, INVENTED, path.loop)).toBe(standardPlan(path.loop));
    },
  },
]);
