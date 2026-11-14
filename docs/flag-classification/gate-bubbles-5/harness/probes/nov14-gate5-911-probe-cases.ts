import { appendFileSync } from "node:fs";

import { vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/* GATE-ONLY probes (v2-Gate-Bubbles-5, 14 Nov 2026) for #911 REPORTED_NOT_OBSERVED. Invented person. Records the saved Observation. */
const FLAG = "REPORTED_NOT_OBSERVED_ENABLED";
const PIA: DirectoryRow = { id: "e-gate5-911", firstName: "Pia", lastName: "Wexcombe", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
// [key, manager's request, what the draft model writes]
const ROWS: [string, string, string][] = [
  ["stated-plain", "create a CA for Pia Wexcombe, she yelled at a customer on 11/3/26", "Observed:\nPia Wexcombe was observed yelling at a customer on November 3, 2026."],
  ["first-hand-i-saw", "create a CA for Pia Wexcombe, I saw her yelling at a customer on 11/3/26", "Observed:\nPia Wexcombe was observed yelling at a customer on November 3, 2026."],
  ["first-hand-i-witnessed", "create a CA for Pia Wexcombe, I witnessed her on her phone the whole shift on 11/3/26", "Observed:\nPia Wexcombe was observed on the phone the whole shift on November 3, 2026."],
  ["reported-by-coworker", "create a CA for Pia Wexcombe, a coworker told me she yelled at a customer on 11/3/26", "Observed:\nPia Wexcombe was observed yelling at a customer on November 3, 2026."],
  ["camera", "create a CA for Pia Wexcombe, the camera showed her taking cash from the drawer on 11/3/26", "Observed:\nPia Wexcombe was observed on camera taking cash from the drawer on November 3, 2026."],
  ["witnessed-word", "create a CA for Pia Wexcombe, she yelled at a customer on 11/3/26", "Observed:\nPia Wexcombe was witnessed yelling at a customer on November 3, 2026."],
  ["seen-word", "create a CA for Pia Wexcombe, she was on her phone on 11/3/26", "Observed:\nPia Wexcombe was seen on her phone on November 3, 2026."],
  ["observed-heading-only", "create a CA for Pia Wexcombe, she was late on 11/3/26", "Observed:\nPia Wexcombe arrived late on November 3, 2026."],
  ["manager-said-observed", "create a CA for Pia Wexcombe, she was observed sleeping in the back room on 11/3/26", "Observed:\nPia Wexcombe was observed sleeping in the back room on November 3, 2026."],
  ["two-sentences-mixed", "create a CA for Pia Wexcombe, I saw her yelling at a customer on 11/3/26 and she was also late", "Observed:\nPia Wexcombe was observed yelling at a customer on November 3, 2026. Pia Wexcombe was also observed arriving late."],
];
export const GATE5_911_PROBE_CASES: ReplayCase[] = ROWS.map(([key, said, written]): ReplayCase => ({
  id: `gate5-911-${key}`,
  title: `gate-only: "${said}"`,
  report: "gate-only",
  status: "fixed",
  fixFlags: [FLAG],
  async run(t) {
    vi.setSystemTime(new Date("2026-11-14T08:00:00Z"));
    t.directory([...STAFF, PIA]);
    t.as("location_manager", WEST_DODGE);
    const thread = t.thread();
    await thread.say(said);
    t.draftWrites({ observation: written });
    const id = await thread.create();
    appendFileSync(process.env.PROBE_OUT ?? "/dev/null", JSON.stringify({ key, mode: process.env[FLAG] === "true" ? "ON" : "off", saved: t.values(id).observation ?? "" }) + "\n");
  },
}));
