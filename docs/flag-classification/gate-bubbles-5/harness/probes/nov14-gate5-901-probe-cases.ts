import { appendFileSync } from "node:fs";

import { vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";
import { patch } from "./nov7-step-b-refusals-scenarios";

/* GATE-ONLY probes (v2-Gate-Bubbles-5, 14 Nov 2026) for #901 DIFF_REPLY_OPTION_LABELS. Invented person. Records the Changed… lines. */
const FLAG = "DIFF_REPLY_OPTION_LABELS_ENABLED";
const PIA: DirectoryRow = { id: "e-gate5-901", firstName: "Pia", lastName: "Wexcombe", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
type Edit = [string, ReturnType<typeof patch> | null];
const ROWS: [string, Edit[]][] = [
  ["phone", [["change the issue to she was on her phone the whole shift", patch("this_form", [{ field: "observation", value: "Observed:\nShe was on her phone the whole shift.", how: "replace", evidence: "she was on her phone the whole shift" }])]]],
  ["sanitation-other", [["change the issue to not doing the 10-minute sanitation", patch("this_form", [{ field: "observation", value: "Observed:\nShe did not do the 10-minute sanitation.", how: "replace", evidence: "not doing the 10-minute sanitation" }])]]],
  ["phone-and-sanitation", [["change the issue to she was on her phone and did not do the sanitation", patch("this_form", [{ field: "observation", value: "Observed:\nShe was on the phone and did not do the sanitation.", how: "replace", evidence: "she was on her phone and did not do the sanitation" }])]]],
  ["level-written", [["make it a written warning", null]]],
  ["payroll-yes", [["payroll deduct yes, $20", null]]],
  ["tick-direct", [["tick standards of conduct", patch("this_form", [{ field: "offense_type", options: ["standards_of_conduct"], how: "replace", evidence: "standards of conduct" }])]]],
  ["untick", [["untick attendance", patch("this_form", [{ field: "offense_type", options: [], how: "replace", evidence: "untick attendance" }])]]],
];
export const GATE5_901_PROBE_CASES: ReplayCase[] = ROWS.map(([key, edits]): ReplayCase => ({
  id: `gate5-901-${key}`,
  title: `gate-only: ${edits.map(([s]) => `"${s}"`).join(" then ")}`,
  report: "gate-only",
  status: "fixed",
  fixFlags: [FLAG],
  async run(t) {
    vi.setSystemTime(new Date("2026-11-14T08:00:00Z"));
    t.directory([...STAFF, PIA]);
    t.as("location_manager", WEST_DODGE);
    const thread = t.thread();
    await thread.say("create ca form for pia wexcombe for violating attendance policy, she was late on 11/12/26. verbal. no payroll deduct.");
    t.draftWrites({ observation: "Observed:\nPia Wexcombe was late on November 12, 2026." });
    await thread.create();
    const out: string[] = [];
    for (const [said, read] of edits) {
      if (read) t.patchReads!({ [said]: read });
      const reply = await thread.say(said);
      out.push(...reply.content.split("\n").filter((line) => /^Changed |^Unticked|^Ticked|"[a-z]+(?:_[a-z]+)+"/.test(line)));
      if (!out.length) out.push(`(no Changed line) ${reply.content.slice(0, 120).replace(/\n/g, " / ")}`);
    }
    appendFileSync(process.env.PROBE_OUT ?? "/dev/null", JSON.stringify({ key, mode: process.env[FLAG] === "true" ? "ON" : "off", lines: out.map((l) => l.slice(0, 140)) }) + "\n");
  },
}));
