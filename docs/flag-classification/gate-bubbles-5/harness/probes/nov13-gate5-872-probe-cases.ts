import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { patch } from "./nov7-step-b-refusals-scenarios";

/* GATE-ONLY probes for #872 (Gate-Bubbles-5, 13 Nov 2026; not in any PR). Invented person. Each case records what it sees. */
const TESS: DirectoryRow = { id: "e-gate5-872", firstName: "Tess", lastName: "Varga", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const LATE = "create ca form for tess varga for violating attendance policy, she was late on 10/20/26. verbal. no payroll deduct.";
const SANITATION = "change the issue to not doing the 10-minute sanitation";
const PHONE = "change the issue to she was on her phone the whole shift";

async function lateCa(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-10-25T15:00:00Z"));
  t.directory([...STAFF, TESS]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  await thread.say(LATE);
  t.draftWrites({ observation: "Observed:\nTess Varga was late on October 20, 2026." });
  const id = await thread.create();
  return { thread, id };
}
const snap = (t: ReplayContext, id: string) => ({ offense: t.checked(id).offense_type ?? [], violated: t.values(id).policy_violated ?? "", plan: t.values(id).action_plan ?? "", obs: t.values(id).observation ?? "" });

import { appendFileSync } from "node:fs";
export const GATE5_872_PROBE_CASES: ReplayCase[] = [
  ...[["sanitation", "change the issue to not doing the 10-minute sanitation", "Observed:\nTess Varga did not do the 10-minute sanitation.", "not doing the 10-minute sanitation"], ["phone", "change the issue to she was on her phone the whole shift", "Observed:\nShe was on her phone the whole shift.", "she was on her phone the whole shift"]].map(([key, said, value, evidence]): ReplayCase => ({
    id: `gate5-872-plan-text-${key}`, title: `plan text after ${key}`, report: "gate-only", status: "fixed", fixFlags: ["ACCOUNT_CHANGE_REDERIVES_POLICY_ENABLED"],
    async run(t) {
      const { thread, id } = await lateCa(t);
      t.patchReads!({ [said]: patch("this_form", [{ field: "observation", value, how: "replace", evidence }]) });
      await thread.say(said);
      appendFileSync(process.env.PROBE_OUT ?? "/dev/null", `${key} | ${process.env.ACCOUNT_CHANGE_REDERIVES_POLICY_ENABLED ?? "-"} | ${JSON.stringify(snap(t, id))} | lang=${JSON.stringify((t.values(id).policy_language ?? "").slice(0, 80))}\n`);
    },
  })),
  {
    id: "gate5-872-manager-plan-kept",
    title: "manager typed the Action Plan, then the account is replaced: the plan is kept",
    report: "gate-only", status: "fixed", fixFlags: ["ACCOUNT_CHANGE_REDERIVES_POLICY_ENABLED"],
    async run(t) {
      const { thread, id } = await lateCa(t);
      t.typeOnForm(id, { action_plan: "Manager plan: Tess will meet with me weekly." });
      t.patchReads!({ [SANITATION]: patch("this_form", [{ field: "observation", value: "Observed:\nTess Varga did not do the 10-minute sanitation.", how: "replace", evidence: "not doing the 10-minute sanitation" }]) });
      await thread.say(SANITATION);
      const s = snap(t, id);
      expect(s.plan, `manager plan changed: ${JSON.stringify(s)}`).toBe("Manager plan: Tess will meet with me weekly.");
    },
  },
  {
    id: "gate5-872-manager-violated-and-tick-kept",
    title: "manager typed Policy Violated and owns the offense tick, then the phone account: both kept",
    report: "gate-only", status: "fixed", fixFlags: ["ACCOUNT_CHANGE_REDERIVES_POLICY_ENABLED"],
    async run(t) {
      const { thread, id } = await lateCa(t);
      const before = t.checked(id).offense_type ?? [];
      t.typeOnForm(id, { policy_violated: "Attendance (as I wrote it)", offense_type: t.values(id).offense_type ?? "" });
      t.patchReads!({ [PHONE]: patch("this_form", [{ field: "observation", value: "Observed:\nShe was on her phone the whole shift.", how: "replace", evidence: "she was on her phone the whole shift" }]) });
      await thread.say(PHONE);
      const s = snap(t, id);
      expect(s.violated, `manager Policy Violated changed: ${JSON.stringify(s)}`).toBe("Attendance (as I wrote it)");
      expect(s.offense, `manager tick changed: ${JSON.stringify(s)}`).toEqual(before);
    },
  },
  ...[
    ["in-the-morning", "add that it was in the morning", "It was in the morning."],
    ["also-phone-add", "add that she was also on her phone", "She was also on her phone."],
  ].map(([key, said, sentence]): ReplayCase => ({
    id: `gate5-872-addition-no-rederive-${key}`,
    title: `"${said}" adds to the account: the offense, Policy Violated and plan stay Attendance`,
    report: "gate-only", status: "fixed", fixFlags: ["ACCOUNT_CHANGE_REDERIVES_POLICY_ENABLED"],
    async run(t) {
      const { thread, id } = await lateCa(t);
      const before = snap(t, id);
      t.patchReads!({ [said]: patch("this_form", [{ field: "observation", value: sentence, how: "add", evidence: said.replace(/^add that /, "") }]) });
      await thread.say(said);
      const s = snap(t, id);
      expect(s.obs, `the addition did not land: ${JSON.stringify(s)}`).toContain(sentence.replace(/\.$/, ""));
      expect(s.offense, `re-derived the offense: ${JSON.stringify({ before, s })}`).toEqual(before.offense);
      expect(s.violated, `re-derived Policy Violated: ${JSON.stringify({ before, s })}`).toBe(before.violated);
      expect(s.plan, `re-derived the plan: ${JSON.stringify({ before, s })}`).toBe(before.plan);
    },
  })),
];
