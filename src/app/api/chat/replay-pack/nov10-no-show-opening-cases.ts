import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { failureToOpenPeople } from "./nov10-failure-to-open-cases";

/**
 * ============================================================================
 * A NO-SHOW TO AN OPENING SHIFT IS ATTENDANCE (QA's ruling on live round 17b, 10 Nov 2026)
 * ============================================================================
 *
 * Round 17b, item 4 (22:32:58Z): "did not show up for a scheduled opening shift" was cited as Late Opening. QA's
 * ruling: a no-show to an opening shift is an absence, cited as Attendance, consistent with Pau's missed-shift ruling
 * (MISSED_SHIFT_CITES_ATTENDANCE) and the sibling app today; Late Opening is only the store opening late ("failure to
 * open on time", "opened late"). NO_SHOW_OPENING_IS_ATTENDANCE_ENABLED. Its two lines are in `ca-policy.ts`
 * (Coding-2's file), requested through QA, so the fix-flag run is expected to fail until they land.
 */
const FLAG = "NO_SHOW_OPENING_IS_ATTENDANCE_ENABLED";
const REPORT = "QA's live Bubbles round 17b, item 4 (10 Nov 2026), and QA's ruling";
const NO_SHOW = "Can you make a CA for Corisande Pell, she did not show up for a scheduled opening shift";
const FAILURE = "Can you make a CA for Corisande Pell for failure to open on time?";
const policyLine = (content: string) => /\*\*Policy:\*\*[^\n]*/.exec(content)?.[0] ?? "";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-10T22:30:00Z"));
  t.directory([...STAFF, ...failureToOpenPeople()]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV10_NO_SHOW_OPENING_CASES: ReplayCase[] = [
  ...([
    ["as-typed", NO_SHOW],
    ["lower", NO_SHOW.toLowerCase()],
  ] as const).map(([casing, said]) => ({
    id: `nov10-no-show-opening-is-attendance-${casing}`,
    title: `"${said}" cites Attendance, never Late Opening`,
    report: `${REPORT}; ${casing}`,
    status: { open: "cited as Late Opening" },
    fixFlags: [FLAG],
    // The ca-policy.ts lines are in (coding 2): it holds with the fix flag, so the fixStatus goes.
    async run(t: ReplayContext) {
      const thread = start(t);
      const reply = await thread.say(said);
      expect(policyLine(reply.content), `not Attendance:\n${reply.content}`).toMatch(/Attendance/);
      expect(reply.content, `cited as Late Opening:\n${reply.content}`).not.toMatch(/Late Opening/);
      // QA (round 17b): the card quotes only what was typed.
      const quoted = /from what you described \("([^"]+)"\)/.exec(reply.content)?.[1];
      if (quoted) expect(said.toLowerCase(), `quotes words never said:\n${reply.content}`).toContain(quoted.toLowerCase());
    },
  })),
  {
    id: "nov10-no-show-opening-control-failure-to-open",
    title: "control: \"failure to open on time\" is still Late Opening",
    report: `${REPORT}: the ruling's other half`,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t: ReplayContext) {
      const thread = start(t);
      const reply = await thread.say(FAILURE);
      expect(policyLine(reply.content), `not Late Opening:\n${reply.content}`).toMatch(/Late Opening/);
    },
  },
];
