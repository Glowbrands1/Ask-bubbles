import { describe, expect, it } from "vitest";

import { keptPlanSteps, withCardPlanSteps, withPlanSteps } from "./stated-plan-steps";

/*
 * Ported from the sibling app (its f062, Pau via QA, 20 Nov 2026): the manager's closing line, word for word; the
 * person is the loop roster's invented Ozren Brack (`replay-pack/loop-roster.ts`).
 */
const SAID = "I want this documented as a written corrective action and the opening procedures reviewed with Ozren Brack this week.";
const PLAN = "Management will review the Attendance policy with Ozren. Future policy violations may result in additional corrective action up to and including termination of employment.";

describe("keptPlanSteps", () => {
  it("keeps a step whose words the manager said, tidied as a sentence", () => {
    expect(keptPlanSteps(["review the opening procedures with Ozren Brack this week"], SAID)).toEqual(["Review the opening procedures with Ozren Brack this week."]);
  });
  it("never keeps a step the manager did not state", () => {
    expect(keptPlanSteps(["schedule a follow-up meeting in two weeks"], SAID)).toEqual([]);
    expect(keptPlanSteps(["review"], SAID)).toEqual([]);
    expect(keptPlanSteps("review the opening procedures", SAID)).toEqual([]);
  });
  it("keeps at most three steps, in order, without repeats", () => {
    const said = "Review the opening checklist, retrain on the register, review the opening checklist, check the cash count, walk the store at close.";
    expect(keptPlanSteps(["review the opening checklist", "Review the opening checklist.", "retrain on the register", "check the cash count", "walk the store at close"], said)).toEqual([
      "Review the opening checklist.",
      "Retrain on the register.",
      "Check the cash count.",
    ]);
  });
});

describe("withPlanSteps", () => {
  it("adds the step before the closing, with the first name, the rest byte for byte", () => {
    expect(withPlanSteps(PLAN, ["Review the opening procedures with Ozren Brack this week."], "Ozren Brack")).toBe(
      "Management will review the Attendance policy with Ozren. Review the opening procedures with Ozren this week. Future policy violations may result in additional corrective action up to and including termination of employment.",
    );
  });
  it("puts the step before a termination closing too", () => {
    const termination = "Management will review the Attendance policy with Ozren. Effective immediately, employment is terminated following the progressive corrective action plan.";
    expect(withPlanSteps(termination, ["Return the store keys today."], "Ozren Brack")).toBe(
      "Management will review the Attendance policy with Ozren. Return the store keys today. Effective immediately, employment is terminated following the progressive corrective action plan.",
    );
  });
  it("with no closing, adds the step at the end", () => {
    expect(withPlanSteps("Management will review the Attendance policy with Ozren.", ["Return the store keys today."])).toBe(
      "Management will review the Attendance policy with Ozren. Return the store keys today.",
    );
  });
  it("with no step, or a step already in the plan, returns the plan byte-identical", () => {
    expect(withPlanSteps(PLAN, [], "Ozren Brack")).toBe(PLAN);
    expect(withPlanSteps(PLAN, null)).toBe(PLAN);
    expect(withPlanSteps(PLAN, ["Management will review the Attendance policy with Ozren."], "Ozren Brack")).toBe(PLAN);
  });
});

describe("withCardPlanSteps", () => {
  const card = `Here's the Corrective Action Form for **Ozren Brack**.\n\n**Action plan:** ${PLAN}\n`;
  it("adds the card's steps to its Action plan line, as Create will save it", () => {
    const answer = withCardPlanSteps({ content: card, formProposal: { planSteps: ["Review the opening procedures with Ozren Brack this week."], employeeName: "Ozren Brack" } });
    expect(answer.content).toContain("**Action plan:** Management will review the Attendance policy with Ozren. Review the opening procedures with Ozren this week. Future policy violations");
  });
  it("a card with no steps, or no plan line, is returned as it was", () => {
    const none = { content: card, formProposal: { employeeName: "Ozren Brack" } };
    expect(withCardPlanSteps(none)).toBe(none);
    const noLine = { content: "Here's the card.", formProposal: { planSteps: ["Return the store keys today."] } };
    expect(withCardPlanSteps(noLine)).toBe(noLine);
  });
});
