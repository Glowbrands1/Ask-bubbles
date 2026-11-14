import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * ATTENDANCE AND ANOTHER POLICY: PAU'S ATTENDANCE PLAN, PLUS ONE LINE PER OTHER POLICY (MIXED_POLICY_PLAN_ENABLED)
 * ============================================================================
 *
 * QA's Bubbles Create check (13 Nov 2026), tonight's wording with an invented person: "<B> was late on 11/3/26" and "she
 * yelled at a customer". The draft carried Attendance and Standards of Conduct, but the Action Plan covered lateness
 * only. Pau chose option A (13 Nov 23:57Z): keep the attendance plan exactly and add one line per other policy, "Management
 * will review the <Policy> policy with <employee>.". The card's plan and the saved plan agree. An Attendance-only CA is
 * unchanged. Run with NAMED_POLICIES_ALL_KEPT and POLICY_LINE_COVERS_EVERY_SECTION, which keep both offenses.
 */

const NELL: DirectoryRow = { id: "e-nell-orrin-mpp", firstName: "Nell", lastName: "Orrin", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const BOTH = "create a ca for Nell Orrin, she was late on 11/3/26 and she yelled at a customer. verbal. no payroll deduct.";
const NAMED = "create a ca for Nell Orrin for violating the attendance policy and standards of conduct, she was late on 11/3/26 and she yelled at a customer. verbal. no payroll deduct.";
const LATE_ONLY = "create a ca for Nell Orrin for violating the attendance policy, she was late on 11/3/26. verbal. no payroll deduct.";
const REPORT = "QA's Bubbles Create check (13 Nov 2026): \"<B> was late on 11/3/26\" + \"she yelled at a customer\" saved a plan that covered lateness only; Pau's option A";
const KEEP_BOTH = ["NAMED_POLICIES_ALL_KEPT_ENABLED", "POLICY_LINE_COVERS_EVERY_SECTION_ENABLED"];
const FLAG = "MIXED_POLICY_PLAN_ENABLED";
const LATENESS_PLAN = /^Nell is expected to arrive on time for all scheduled shifts moving forward\. Leadership will monitor Nell's attendance closely and provide coaching as needed\. A follow-up meeting will be scheduled to review progress\. Continued lateness will result in further disciplinary review per company policy\. /;
const SOC_LINE = "Management will review the Standards of Conduct policy with Nell.";

async function create(t: ReplayContext, request: string, observation: string) {
  vi.setSystemTime(new Date("2026-11-10T15:00:00Z"));
  t.directory([...STAFF, NELL]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  const card = await thread.say(request);
  t.draftWrites({ observation });
  const id = await thread.create();
  const cardPlan = /^\*\*Action plan:\*\*\s*(.+)$/im.exec(card.content)?.[1]?.trim() ?? "";
  return { id, cardPlan, card: card.content };
}

function mixedPlan(t: ReplayContext, id: string, cardPlan: string, card: string) {
  const plan = t.values(id).action_plan ?? "";
  expect(plan, `the lateness plan is not kept as it is:\n${plan}`).toMatch(LATENESS_PLAN);
  expect(plan, `no line for the Standards of Conduct:\n${plan}`).toContain(SOC_LINE);
  expect(plan.indexOf(SOC_LINE), "the line is not before the closing").toBeLessThan(plan.indexOf("Future policy violations"));
  expect(plan.match(/Management will review/g)?.length ?? 0, `more than one line per other policy:\n${plan}`).toBe(1);
  expect(cardPlan, `the card's plan and the saved plan differ:\n${card}\n---\n${plan}`).toBe(plan);
}

export const NOV14_MIXED_POLICY_PLAN_CASES: ReplayCase[] = [
  {
    id: "nov14-mixed-policy-plan-described",
    title: `"${BOTH}": Pau's attendance plan plus "${SOC_LINE}", the same on the card and the draft`,
    report: REPORT,
    status: { open: "the plan covers lateness only" },
    fixFlags: [...KEEP_BOTH, FLAG],
    async run(t) {
      const { id, cardPlan, card } = await create(t, BOTH, "Observed:\nNell Orrin was late on November 3, 2026 and she yelled at a customer.");
      mixedPlan(t, id, cardPlan, card);
    },
  },
  {
    id: "nov14-mixed-policy-plan-named",
    title: `"${NAMED}": the same with both policies named`,
    report: REPORT,
    status: { open: "the plan covers one policy only" },
    fixFlags: [...KEEP_BOTH, FLAG],
    async run(t) {
      const { id, cardPlan, card } = await create(t, NAMED, "Observed:\nNell Orrin was late on November 3, 2026 and she yelled at a customer.");
      mixedPlan(t, id, cardPlan, card);
    },
  },
  {
    id: "nov14-mixed-policy-plan-attendance-only-unchanged",
    title: `"${LATE_ONLY}": an Attendance-only CA keeps Pau's plan unchanged`,
    report: `${REPORT}; negative`,
    status: "fixed",
    fixFlags: [...KEEP_BOTH, FLAG],
    async run(t) {
      const { id } = await create(t, LATE_ONLY, "Observed:\nNell Orrin was late on November 3, 2026.");
      const plan = t.values(id).action_plan ?? "";
      expect(plan).toMatch(LATENESS_PLAN);
      expect(plan).not.toMatch(/Management will review/);
    },
  },
];

/*
 * QA, 14 Nov 2026 (the chain on 17z, where OTHER_POLICY_AGREES is live): two described offenses and a cleaning duty
 * beside them. Attendance, Standards of Conduct and Other are all ticked; Policy Violated lists all three; the plan is
 * Pau's attendance plan plus the Standards of Conduct line, and Other adds no plan line (QA's F2: Other is never a policy
 * name in the plan).
 */
const THREE = "create a ca for Nell Orrin, she was late on 11/3/26 and yelled at a customer, and didn't do the sanitation. verbal. no payroll deduct.";

export const NOV14_MIXED_POLICY_PLAN_BESIDE_OTHER_CASES: ReplayCase[] = [
  {
    id: "nov14-mixed-policy-plan-two-offenses-and-cleaning",
    title: `"${THREE}": Attendance, Standards of Conduct and Other ticked; Policy Violated lists all three; Pau's plan plus the conduct line`,
    report: "QA, 14 Nov 2026: the two-offense chain beside a cleaning duty (OTHER_POLICY_AGREES on in 17z)",
    status: { open: "with the chain off, Standards of Conduct is not kept beside lateness and the cleaning duty" },
    fixFlags: [...KEEP_BOTH, FLAG],
    async run(t) {
      const { id, card, cardPlan } = await create(t, THREE, "Observed:\nNell Orrin was late on November 3, 2026, yelled at a customer, and did not do the sanitation.");
      // Gate-Bubbles-4's NO-GO probe (14 Nov 2026): the saved form was right, the card was not. The card's Policy line
      // covers Attendance and Standards of Conduct with the Other note, and the card's plan carries the conduct line.
      const policyLine = /^\*\*Policy:\*\*.*$/im.exec(card)?.[0] ?? "";
      expect(policyLine, `the card's Policy line drops Attendance:\n${card}`).toMatch(/attendance/i);
      expect(policyLine, `the card's Policy line drops Standards of Conduct:\n${card}`).toMatch(/standards of conduct/i);
      expect(card, `the card does not note Other:\n${card}`).toContain("recorded under **Other** on the form too");
      expect(cardPlan, `the card's plan has no conduct line:\n${card}`).toContain(SOC_LINE);
      const offense = t.checked(id).offense_type ?? [];
      const values = t.values(id);
      const where = JSON.stringify({ offense, violated: values.policy_violated, plan: (values.action_plan ?? "").slice(-200) });
      expect(offense.some((key) => /attendance|tardiness/.test(key)), `Attendance is not ticked ${where}`).toBe(true);
      expect(offense, `Standards of Conduct is not ticked ${where}`).toContain("standards_of_conduct");
      expect(offense, `Other is not ticked ${where}`).toContain("other");
      expect(values.policy_violated ?? "", `Policy Violated dropped Attendance ${where}`).toMatch(/attendance/i);
      expect(values.policy_violated ?? "", `Policy Violated dropped Standards of Conduct ${where}`).toMatch(/standards of conduct/i);
      expect(values.policy_violated ?? "", `Policy Violated dropped Other ${where}`).toMatch(/\bOther\b/);
      const plan = values.action_plan ?? "";
      expect(plan, `the lateness plan is not kept as it is ${where}`).toMatch(LATENESS_PLAN);
      expect(plan, `no line for the Standards of Conduct ${where}`).toContain(SOC_LINE);
      expect(plan, `the plan names Other as a policy ${where}`).not.toMatch(/\bthe Other polic/i);
      expect(plan.match(/Management will review/g)?.length ?? 0, `more than one review line ${where}`).toBe(1);
    },
  },
];
