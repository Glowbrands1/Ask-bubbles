import { appendFileSync } from "node:fs";

import { vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/* GATE-ONLY live-risk probe (v2-Gate-Bubbles-5 for v2-QA, 14 Nov 2026) on main 65b7951d with production flags. Invented person.
 * "off892" runs with OTHER_POLICY_AGREES + OTHER_NOT_A_POLICY_NAME forced off (FLAG_CLASSIFY_OFF), i.e. main before #892. */
const PIA: DirectoryRow = { id: "e-gate5-live", firstName: "Pia", lastName: "Wexcombe", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const ROWS: [string, string, string][] = [
  ["opening-duties-exact", "Write me a CA for Pia Wexcombe for failing to complete opening duties. Pia Wexcombe did not complete daily cleaning duties. on november 2, 2026", "Observed:\nPia Wexcombe failed to complete opening duties. Pia Wexcombe did not complete daily cleaning duties on November 2, 2026."],
  ["closing-duties", "Write me a CA for Pia Wexcombe for failing to complete closing duties. Pia Wexcombe did not complete daily cleaning duties. on november 2, 2026", "Observed:\nPia Wexcombe failed to complete closing duties. Pia Wexcombe did not complete daily cleaning duties on November 2, 2026."],
  ["opening-checklist", "Write me a CA for Pia Wexcombe for not completing the opening checklist. Pia Wexcombe did not complete daily cleaning duties. on november 2, 2026", "Observed:\nPia Wexcombe did not complete the opening checklist. Pia Wexcombe did not complete daily cleaning duties on November 2, 2026."],
  ["side-work", "Write me a CA for Pia Wexcombe for not doing her side work. Pia Wexcombe did not complete daily cleaning duties. on november 2, 2026", "Observed:\nPia Wexcombe did not do her side work. Pia Wexcombe did not complete daily cleaning duties on November 2, 2026."],
  ["closing-checklist-restrooms", "Write me a CA for Pia Wexcombe for not finishing the closing checklist, she didn't clean the restrooms on november 2, 2026", "Observed:\nPia Wexcombe did not finish the closing checklist and did not clean the restrooms on November 2, 2026."],
  ["control-opening-alone", "Write me a CA for Pia Wexcombe for failing to complete opening duties on november 2, 2026", "Observed:\nPia Wexcombe failed to complete opening duties on November 2, 2026."],
  ["control-cleaning-alone", "Write me a CA for Pia Wexcombe, she did not complete daily cleaning duties on november 2, 2026", "Observed:\nPia Wexcombe did not complete daily cleaning duties on November 2, 2026."],
];
export const GATE5_LIVE_OTHER_PROBE_CASES: ReplayCase[] = ROWS.map(([key, said, observation]): ReplayCase => ({
  id: `gate5-live-other-${key}`,
  title: `gate-only live probe: "${said}"`,
  report: "gate-only",
  status: "fixed",
  async run(t) {
    vi.setSystemTime(new Date("2026-11-14T08:00:00Z"));
    t.directory([...STAFF, PIA]);
    t.as("location_manager", WEST_DODGE);
    const thread = t.thread();
    const card = await thread.say(said);
    const policy = /\*\*Policy:\*\*[^\n]*/.exec(card.content)?.[0] ?? "(no Policy line)";
    t.draftWrites({ observation });
    const id = await thread.create();
    const v = t.values(id);
    const mode = process.env.OTHER_POLICY_AGREES_ENABLED === "true" ? "prod" : "off892";
    appendFileSync(process.env.PROBE_OUT ?? "/dev/null", JSON.stringify({ key, mode, card: policy.slice(0, 260), offense: t.checked(id).offense_type ?? [], violated: v.policy_violated ?? "", direct: (v.policy_language ?? "").slice(0, 90), plan: (v.action_plan ?? "").slice(0, 160) }) + "\n");
  },
}));
