import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * SANITATION LEFT UNDONE IS OTHER, ON THE CARD AND THE DRAFT (OTHER_POLICY_AGREES_ENABLED, OTHER_NOT_A_POLICY_NAME_ENABLED)
 * ============================================================================
 *
 * Ported from the sibling app at QA's direction (14 Nov 2026). Its sanitation report, in the manager's words with the
 * typos kept: "please make a ca for <A> for not doing th e10 minute sanitaion". Pau's rule: cleaning duties left undone
 * are recorded under Other. Here the cleaning reader did not read "sanitaion"/"sanitation" at all, so the card named no
 * policy and the draft had no box. On: the card says Other, the draft ticks Other, Policy Violated is Other, Direct
 * policy stays blank (Other names no section) and the plan reviews "the applicable company policy", never "the Other
 * policy". A manager who names Care and Cleaning keeps that policy. The person is invented (on no directory).
 */

const ODESSA: DirectoryRow = { id: "e-odessa-opa", firstName: "Odessa", lastName: "Quillfeather", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const TYPED = "please make a ca for Odessa Quillfeather for not doing th e10 minute sanitaion";
const SPELLED = "please make a ca for Odessa Quillfeather for not doing the 10 minute sanitation";
const NAMED = "make a ca for Odessa Quillfeather for violating the care and cleaning policy, she did not do the 10 minute sanitation";
const REPORT = "The sibling app's sanitation report (QA, 11 Nov 2026), ported at QA's direction (14 Nov 2026): \"please make a ca for <A> for not doing th e10 minute sanitaion\"";
const FLAGS = ["OTHER_POLICY_AGREES_ENABLED", "OTHER_NOT_A_POLICY_NAME_ENABLED"];

async function create(t: ReplayContext, ask: string) {
  vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
  t.directory([...STAFF, ODESSA]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  const card = await thread.say(ask);
  t.draftWrites({ observation: "Observed:\nOdessa Quillfeather did not do the 10 minute sanitation." });
  const id = await thread.create();
  return { card, id };
}

function isOther(t: ReplayContext, id: string, card: string) {
  const values = t.values(id);
  expect(card, `the card does not say Other:\n${card}`).toMatch(/\*\*Policy:\*\* Other/);
  expect(card, `the card cites Care and Cleaning:\n${card}`).not.toMatch(/care and cleaning/i);
  expect(t.checked(id).offense_type ?? [], "the draft does not tick Other").toEqual(["other"]);
  expect(values.policy_violated ?? "", "Policy Violated is not Other").toMatch(/^Other$/);
  expect(values.policy_language ?? "", "Direct policy quotes a section for Other").toBe("");
  expect(values.action_plan ?? "", "the plan names Other as a policy").not.toMatch(/\bthe Other polic/i);
  expect(values.action_plan ?? "", "the plan does not review the applicable company policy").toMatch(/applicable company policy/i);
}

export const NOV14_OTHER_POLICY_AGREES_CASES: ReplayCase[] = [
  {
    id: "nov14-other-policy-agrees-sanitation-typed",
    title: `"${TYPED}": the card and the draft say Other, Direct policy is blank, the plan reviews the applicable company policy`,
    report: REPORT,
    status: { open: "no policy on the card and no box on the draft: the sanitation is not read as cleaning" },
    fixFlags: FLAGS,
    async run(t) {
      const { card, id } = await create(t, TYPED);
      isOther(t, id, card.content);
    },
  },
  {
    id: "nov14-other-policy-agrees-sanitation-spelled",
    title: `"${SPELLED}": the same with the word spelled`,
    report: REPORT,
    status: { open: "no policy on the card and no box on the draft: the sanitation is not read as cleaning" },
    fixFlags: FLAGS,
    async run(t) {
      const { card, id } = await create(t, SPELLED);
      isOther(t, id, card.content);
    },
  },
  {
    id: "nov14-other-policy-agrees-care-and-cleaning-named",
    title: `"${NAMED}": a named Care and Cleaning stays Care and Cleaning`,
    report: `${REPORT}; negative (a policy the manager names wins)`,
    status: "fixed",
    fixFlags: FLAGS,
    async run(t) {
      const { id } = await create(t, NAMED);
      expect(t.checked(id).offense_type ?? [], "a named Care and Cleaning became Other").not.toContain("other");
      expect(t.values(id).policy_violated ?? "").toMatch(/care and cleaning/i);
    },
  },
];
