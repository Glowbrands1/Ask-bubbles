import { appendFileSync } from "node:fs";

import { vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/* GATE-ONLY probes (v2-Gate-Bubbles-5, 14 Nov 2026) for #896 CLEANING_POLICY_IS_CARE_AND_CLEANING, on main with #892's flags. Invented person. */
const FLAG = "CLEANING_POLICY_IS_CARE_AND_CLEANING_ENABLED";
const PIA: DirectoryRow = { id: "e-gate5-896", firstName: "Pia", lastName: "Wexcombe", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const ROWS: [string, string, string][] = [
  ["cleaning-policy", "make a ca for Pia Wexcombe for violating the cleaning policy, she did not do the sanitation", "Observed:\nPia Wexcombe did not do the sanitation."],
  ["cleaning-duties", "make a ca for Pia Wexcombe for not following cleaning duties", "Observed:\nPia Wexcombe did not follow cleaning duties."],
  ["cleaning-procedures-named", "make a ca for Pia Wexcombe, she broke the cleaning procedures", "Observed:\nPia Wexcombe did not follow the cleaning procedures."],
  ["sanitation-policy", "make a ca for Pia Wexcombe for violating the sanitation policy", "Observed:\nPia Wexcombe violated the sanitation policy."],
  ["duty-undone-no-name", "make a ca for Pia Wexcombe, she did not clean the booths", "Observed:\nPia Wexcombe did not clean the booths."],
  ["cleaning-word-in-account-only", "make a ca for Pia Wexcombe, she was late because she was cleaning the lobby", "Observed:\nPia Wexcombe was late because she was cleaning the lobby."],
  ["cleaning-supplies-not-policy", "make a ca for Pia Wexcombe, she took cleaning supplies home", "Observed:\nPia Wexcombe took cleaning supplies home."],
  ["phone-plus-cleaning-policy", "make a ca for Pia Wexcombe for violating the cleaning policy and the cell phone policy, she was texting and did not clean", "Observed:\nPia Wexcombe was texting and did not clean."],
];
export const GATE5_896_PROBE_CASES: ReplayCase[] = ROWS.map(([key, said, observation]): ReplayCase => ({
  id: `gate5-896-${key}`,
  title: `gate-only: "${said}"`,
  report: "gate-only",
  status: "fixed",
  fixFlags: [FLAG],
  async run(t) {
    vi.setSystemTime(new Date("2026-11-14T08:00:00Z"));
    t.directory([...STAFF, PIA]);
    t.as("location_manager", WEST_DODGE);
    const thread = t.thread();
    const card = await thread.say(said);
    const policy = /\*\*Policy:\*\*[^\n]*/.exec(card.content)?.[0] ?? "(no Policy line)";
    let draft = { offense: [] as string[], violated: "", direct: "", plan: "" };
    if (card.formProposal) {
      t.draftWrites({ observation });
      const id = await thread.create();
      const v = t.values(id);
      draft = { offense: t.checked(id).offense_type ?? [], violated: v.policy_violated ?? "", direct: (v.policy_language ?? "").slice(0, 60), plan: (v.action_plan ?? "").slice(0, 90) };
    }
    appendFileSync(process.env.PROBE_OUT ?? "/dev/null", JSON.stringify({ key, mode: process.env[FLAG] === "true" ? "ON" : "off", policy: policy.slice(0, 200), ...draft }) + "\n");
  },
}));
