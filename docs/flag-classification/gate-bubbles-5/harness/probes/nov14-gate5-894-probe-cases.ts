import { appendFileSync } from "node:fs";

import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/* GATE-ONLY probes (v2-Gate-Bubbles-5, 14 Nov 2026) for #894 LEVEL_LEADS_REQUEST. Invented person. Each records card / level. */
const FLAG = "LEVEL_LEADS_REQUEST_ENABLED";
const PIA: DirectoryRow = { id: "e-gate5-894", firstName: "Pia", lastName: "Wexcombe", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-14T03:30:00Z"));
  t.directory([...STAFF, PIA]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}
type Expect = { card: boolean | null; level?: string | null };
// [key, message, expected with the flag ON] — card null: record only.
const PROBES: [string, string, Expect][] = [
  ["verbal-for-name", "verbal for Pia Wexcombe, she was late on 11/12/26", { card: true, level: "verbal" }],
  ["first-name-only", "second verbal for Pia, she was late on 11/12/26", { card: true, level: "verbal" }],
  ["lowercase-name", "2nd written for pia wexcombe she was late again", { card: true, level: "written" }],
  ["please-a", "please a written for Pia Wexcombe for being late on 11/12/26", { card: true, level: "written" }],
  ["history-then-new-level", "verbal for Pia Wexcombe was on 10/1/26, now she needs a written for being late on 11/12/26", { card: null, level: "written" }],
  ["topic-not-name", "verbal for lateness, how many do we give before a written?", { card: false }],
  ["question", "second verbal for Pia Wexcombe?", { card: null }],
  ["statement-not-request", "verbal for Pia Wexcombe went fine today, she signed it", { card: null }],
  ["day-word", "written for Monday's no call no show", { card: false }],
  ["store-word", "verbal for West Dodge team, everyone was late", { card: null }],
  ["final-written", "final written for Pia Wexcombe, she was late on 11/12/26", { card: null }],
];
export const GATE5_894_PROBE_CASES: ReplayCase[] = PROBES.map(([key, said, want]): ReplayCase => ({
  id: `gate5-894-${key}`,
  title: `gate-only: "${said}"`,
  report: "gate-only",
  status: "fixed",
  fixFlags: [FLAG],
  async run(t) {
    const thread = start(t);
    const answer = await thread.say(said);
    const p = answer.formProposal as { templateKey?: string; employeeName?: string | null; warningLevel?: string | null } | undefined;
    const on = process.env[FLAG] === "true";
    appendFileSync(process.env.PROBE_OUT ?? "/dev/null", `${key} | ${on ? "ON" : "off"} | card=${p ? `${p.templateKey}/${p.employeeName}/${p.warningLevel ?? "-"}` : "none"} | ${answer.content.slice(0, 150).replace(/\n/g, " / ")}\n`);
    if (!on) return;
    if (want.card === true) {
      expect(p?.templateKey, "no CA card").toBe("dpoa");
      if (want.level !== undefined) expect(p?.warningLevel ?? null, "the level").toBe(want.level);
    }
    if (want.card === false) expect(p, `a card for a non-request: ${JSON.stringify(p)}`).toBeFalsy();
    if (want.card === null && p && want.level !== undefined) expect(p.warningLevel ?? null, "the level").toBe(want.level);
  },
}));
