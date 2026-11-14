import { appendFileSync } from "node:fs";

import { vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { patch } from "./nov7-step-b-refusals-scenarios";

/* GATE-ONLY probes (v2-Gate-Bubbles-5, 14 Nov 2026) for #912 ACCOUNT_CHANGE_OTHER_BESIDE. Invented person. Records the four fields after each edit. */
const FLAG = "ACCOUNT_CHANGE_OTHER_BESIDE_ENABLED";
const PIA: DirectoryRow = { id: "e-gate5-912", firstName: "Pia", lastName: "Wexcombe", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const snap = (t: ReplayContext, id: string) => {
  const v = t.values(id);
  return { offense: t.checked(id).offense_type ?? [], violated: v.policy_violated ?? "", direct: (v.policy_language ?? "").slice(0, 55), plan: (v.action_plan ?? "").slice(0, 75), obs: (v.observation ?? "").slice(10, 90) };
};
const edit = (said: string, obs: string, evidence: string): [string, ReturnType<typeof patch>] => [said, patch("this_form", [{ field: "observation", value: obs, how: "replace", evidence }])];
const ROWS: [string, "late" | "sanitation", [string, ReturnType<typeof patch>][]][] = [
  ["late-to-phone-and-sanitation", "late", [edit("change the issue to she was on her phone and did not do the sanitation", "Observed:\nShe was on her phone and did not do the sanitation.", "she was on her phone and did not do the sanitation")]],
  ["late-to-late-and-sanitation", "late", [edit("change the issue to she was late to her shift and did not do the sanitation", "Observed:\nShe was late to her shift and did not do the sanitation.", "she was late to her shift and did not do the sanitation")]],
  ["late-to-rude-and-cleaning", "late", [edit("change the issue to she was rude to a customer and did not clean the booths", "Observed:\nPia Wexcombe was rude to a customer and did not clean the booths.", "she was rude to a customer and did not clean the booths")]],
  ["late-to-sanitation-only", "late", [edit("change the issue to not doing the 10-minute sanitation", "Observed:\nPia Wexcombe did not do the 10-minute sanitation.", "not doing the 10-minute sanitation")]],
  ["late-to-phone-only", "late", [edit("change the issue to she was on her phone the whole shift", "Observed:\nShe was on her phone the whole shift.", "she was on her phone the whole shift")]],
  ["both-then-phone-only", "late", [
    edit("change the issue to she was on her phone and did not do the sanitation", "Observed:\nShe was on her phone and did not do the sanitation.", "she was on her phone and did not do the sanitation"),
    edit("change the issue to she was on her phone the whole shift", "Observed:\nShe was on her phone the whole shift.", "she was on her phone the whole shift"),
  ]],
  ["sanitation-to-phone-and-sanitation", "sanitation", [edit("change the issue to she was on her phone and did not do the sanitation", "Observed:\nShe was on her phone and did not do the sanitation.", "she was on her phone and did not do the sanitation")]],
  ["sanitation-negated-beside-phone", "late", [edit("change the issue to she was on her phone the whole shift but she did do the sanitation", "Observed:\nShe was on her phone the whole shift but she did do the sanitation.", "she was on her phone the whole shift but she did do the sanitation")]],
];
export const GATE5_912_PROBE_CASES: ReplayCase[] = ROWS.map(([key, start, edits]): ReplayCase => ({
  id: `gate5-912-${key}`,
  title: `gate-only: ${start} draft, then ${edits.map(([s]) => `"${s}"`).join(" then ")}`,
  report: "gate-only",
  status: "fixed",
  fixFlags: [FLAG],
  async run(t) {
    vi.setSystemTime(new Date("2026-11-14T08:00:00Z"));
    t.directory([...STAFF, PIA]);
    t.as("location_manager", WEST_DODGE);
    const thread = t.thread();
    if (start === "late") {
      await thread.say("create a ca for Pia Wexcombe, she was late on 11/12/26");
      t.draftWrites({ observation: "Observed:\nPia Wexcombe arrived late for her shift on 11/12/26." }, { offense_type: ["attendance_policy"] });
    } else {
      await thread.say("please make a ca for Pia Wexcombe for not doing the 10 minute sanitation");
      t.draftWrites({ observation: "Observed:\nPia Wexcombe did not do the 10 minute sanitation." });
    }
    const id = await thread.create();
    const steps = [snap(t, id)];
    for (const [said, read] of edits) {
      t.patchReads!({ [said]: read });
      await thread.say(said);
      steps.push(snap(t, id));
    }
    appendFileSync(process.env.PROBE_OUT ?? "/dev/null", JSON.stringify({ key, mode: process.env[FLAG] === "true" ? "ON" : "off", steps }) + "\n");
  },
}));
