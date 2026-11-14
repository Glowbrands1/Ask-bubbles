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

/*
 * Gate-Bubbles-5's #892 probes (14 Nov 2026; QA's ruling (b)): a cleaning duty beside a second offense the account
 * describes. With the flags on, only Other was ticked while Direct policy quoted the phone section (row 1), and the
 * lateness lost Attendance (row 2). QA: tick both; Direct policy and the plan follow the described offense; a cleaning
 * duty that is the only offense stays Other alone. The gate's words; Pia Wexcombe is the gate's invented person.
 */
const PIA: DirectoryRow = { id: "e-pia-opa", firstName: "Pia", lastName: "Wexcombe", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const flagsOn = () => FLAGS.every((flag) => process.env[flag] === "true");
const BESIDE: [string, string, string, RegExp, RegExp][] = [
  [
    "phone",
    "make a ca for Pia Wexcombe, she was on her phone and did not do the 10 minute sanitation",
    "Observed:\nPia Wexcombe was on the phone and did not do the 10 minute sanitation.",
    /cell phone/i,
    /standards_of_conduct/,
  ],
  [
    "late",
    "make a ca for Pia Wexcombe, she was late on 11/3/26 and did not do the sanitation",
    "Observed:\nPia Wexcombe was late on 11/3/26 and did not do the sanitation.",
    /attendance/i,
    /tardiness|attendance/,
  ],
];

export const NOV14_OTHER_BESIDE_DESCRIBED_CASES: ReplayCase[] = BESIDE.map(([key, ask, observation, policy, box]): ReplayCase => ({
  id: `nov14-other-policy-agrees-beside-${key}`,
  title: `"${ask}": the described offense keeps its box, Direct policy and plan; Other is ticked beside it`,
  report: "Gate-Bubbles-5's probes on #892 (14 Nov 2026), QA's ruling (b): tick both, the described section leads",
  status: "fixed",
  fixFlags: FLAGS,
  async run(t) {
    vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
    t.directory([...STAFF, PIA]);
    t.as("location_manager", WEST_DODGE);
    const thread = t.thread();
    const card = await thread.say(ask);
    t.draftWrites({ observation });
    const id = await thread.create();
    const values = t.values(id);
    const offense = t.checked(id).offense_type ?? [];
    const where = JSON.stringify({ offense, violated: values.policy_violated, lang: (values.policy_language ?? "").slice(0, 60), plan: (values.action_plan ?? "").slice(0, 90) });
    expect(values.action_plan ?? "", `the plan names Other as a policy ${where}`).not.toMatch(/\bthe Other polic/i);
    // With the flags off the sanitation is not read at all, and this pack's stand-in model ticks no box for lateness
    // (live, the drafting model does), so the rest is the flags-on contract.
    if (flagsOn()) {
      expect(card.content, `the card's policy is not the described one:\n${card.content}`).toMatch(new RegExp(String.raw`\*\*Policy:\*\*[^\n]*${policy.source}`, "i"));
      expect(card.content, `the card does not say the cleaning duty is recorded under Other:\n${card.content}`).toMatch(/recorded under \*\*Other\*\*/);
      expect(offense.some((k) => box.test(k)), `the described offense lost its box ${where}`).toBe(true);
      expect(offense, `Other is not ticked beside the described offense ${where}`).toContain("other");
      expect(values.policy_violated ?? "", `Policy Violated lost the described policy ${where}`).toMatch(policy);
      expect(values.policy_language ?? "", `Direct policy is not the described section ${where}`).toMatch(policy);
      expect(values.action_plan ?? "", `the plan does not follow the described offense ${where}`).toMatch(policy);
    }
  },
}));
