import { appendFileSync } from "node:fs";

import { vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/* GATE-ONLY probes (v2-Gate-Bubbles-5, 14 Nov 2026) for #898 (LEVEL_ON_INCIDENT_DAY + HISTORY_LEVEL_PRIOR_ROW), alone and with
 * #894 LEVEL_LEADS_REQUEST. Invented person. Record only: the card's level and its Prior actions line. Today 11/13/26. */
const F898 = ["LEVEL_ON_INCIDENT_DAY_ENABLED", "HISTORY_LEVEL_PRIOR_ROW_ENABLED"];
const F894 = "LEVEL_LEADS_REQUEST_ENABLED";
const PIA: DirectoryRow = { id: "e-gate5-898", firstName: "Pia", lastName: "Wexcombe", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const SAID: [string, string][] = [
  ["incident-day", "verbal warning on 11/12/26 for Pia Wexcombe, she was late that day"],
  ["history-by-date", "ca for Pia Wexcombe, verbal warning on 9/21. late again for 30 mins today"],
  ["warning-after-incident", "verbal warning on 11/12/26 for Pia Wexcombe, she was late on 11/10/26"],
  ["warning-before-incident", "verbal warning on 11/10/26 for Pia Wexcombe, she was late on 11/12/26"],
  ["today-yesterday", "written warning today for Pia Wexcombe, she was late yesterday"],
  ["had-a-verbal-plus-written", "written for Pia Wexcombe, she had a verbal on 10/1/26, late again on 11/12/26"],
  ["leads-history-then-written", "verbal for Pia Wexcombe was on 10/1/26, now she needs a written for being late on 11/12/26"],
  ["second-verbal-first-dated", "second verbal for Pia Wexcombe, she was late on 11/12/26, first verbal was 10/1/26"],
  ["same-warning-twice", "ca for Pia Wexcombe, she had a verbal on 9/21, verbal warning on 9/21. late again today"],
  ["two-history-levels", "ca for Pia Wexcombe, verbal warning on 9/21, written warning on 10/15. late again today"],
  ["undated-verbal", "verbal warning for Pia Wexcombe, she was late on 11/12/26"],
];
const CONFIGS: [string, string[]][] = [["898", F898], ["898+894", [...F898, F894]], ["894", [F894]]];
export const GATE5_898_PROBE_CASES: ReplayCase[] = CONFIGS.flatMap(([config, flags]) =>
  SAID.map(([key, said]): ReplayCase => ({
    id: `gate5-898-${config}-${key}`,
    title: `gate-only (${config}): "${said}"`,
    report: "gate-only",
    status: "fixed",
    fixFlags: flags,
    async run(t) {
      vi.setSystemTime(new Date("2026-11-13T18:00:00Z"));
      t.directory([...STAFF, PIA]);
      t.as("location_manager", WEST_DODGE);
      const answer = await t.thread().say(said);
      const p = answer.formProposal as { warningLevel?: string | null } | undefined;
      const prior = /\*\*Prior actions:\*\*[^\n]*/.exec(answer.content)?.[0] ?? "-";
      const mode = flags.every((flag) => process.env[flag] === "true") ? "ON" : "off";
      appendFileSync(process.env.PROBE_OUT ?? "/dev/null", `${key} | ${config} ${mode} | card=${p ? "yes" : "none"} level=${p?.warningLevel ?? "-"} | ${prior.slice(0, 140)}\n`);
    },
  })),
);
