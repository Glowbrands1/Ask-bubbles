import { appendFileSync } from "node:fs";

import { vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/* GATE-ONLY probes (v2-Gate-Bubbles-5, 14 Nov 2026) for #909 UNFOUND_POLICY_GIVES_WAY_TO_ACCOUNT. Invented person. Records the card's Issue and Policy lines. */
const FLAG = "UNFOUND_POLICY_GIVES_WAY_TO_ACCOUNT_ENABLED";
const PIA: DirectoryRow = { id: "e-gate5-909", firstName: "Pia", lastName: "Wexcombe", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const SAID: [string, string][] = [
  ["qa-wording", "create a CA for Pia Wexcombe for violating the pet grooming policy, she was late on 11/3/26"],
  ["period", "create a CA for Pia Wexcombe for violating the pet grooming policy. She was late on 11/3/26."],
  ["no-account", "create a CA for Pia Wexcombe for violating the pet grooming policy"],
  ["known-phone", "create a CA for Pia Wexcombe for violating the cell phone policy, she was texting the whole shift"],
  ["known-attendance-typo", "create a CA for Pia Wexcombe for violating the attendence policy, she was late on 11/3/26"],
  ["manual-not-reader", "create a CA for Pia Wexcombe for violating the care and cleaning policy, she did not clean the booths"],
  ["breaking-unknown", "write up Pia Wexcombe for breaking the parking policy, she parked in the customer spots on 11/3/26"],
  ["unknown-account-also-unknown", "create a CA for Pia Wexcombe for violating the pet grooming policy, she violated the uniform policy"],
  ["not-following-two-sentences", "create a CA for Pia Wexcombe for not following the tip jar policy. On 11/3/26 she took cash from the tip jar."],
  ["policies-plural", "create a CA for Pia Wexcombe for violating company policies, she was rude to a customer on 11/3/26"],
];
export const GATE5_909_PROBE_CASES: ReplayCase[] = SAID.map(([key, said]): ReplayCase => ({
  id: `gate5-909-${key}`,
  title: `gate-only: "${said}"`,
  report: "gate-only",
  status: "fixed",
  fixFlags: [FLAG],
  async run(t) {
    vi.setSystemTime(new Date("2026-11-14T08:00:00Z"));
    t.directory([...STAFF, PIA]);
    t.as("location_manager", WEST_DODGE);
    const answer = await t.thread().say(said);
    const issue = /\*\*Issue:\*\*\s*([^·\n]*)/.exec(answer.content)?.[1]?.trim() ?? "(no Issue)";
    const policy = /\*\*Policy:\*\*[^\n]*/.exec(answer.content)?.[0] ?? "(no Policy line)";
    appendFileSync(process.env.PROBE_OUT ?? "/dev/null", JSON.stringify({ key, mode: process.env[FLAG] === "true" ? "ON" : "off", card: !!answer.formProposal, issue, policy: policy.slice(0, 160) }) + "\n");
  },
}));
