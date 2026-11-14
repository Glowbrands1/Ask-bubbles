import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * QA's follow-ups to both gates on Ask Sunny #970 / this app's #898 (14 Nov 2026), in QA's wordings, the person
 * invented: the Prior actions rows a manager's dated history gives (HISTORY_LEVEL_ROWS, on top of #898's flags).
 */
const REPORT = "QA, 14 Nov 2026: follow-ups to the gates on Ask Sunny #970 / #898";
const FIX = ["LEVEL_ON_INCIDENT_DAY_ENABLED", "HISTORY_LEVEL_PRIOR_ROW_ENABLED", "HISTORY_LEVEL_ROWS_ENABLED"];

function start(t: Parameters<ReplayCase["run"]>[0]) {
  vi.setSystemTime(new Date("2026-11-13T18:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

function priorRows(content: string): string[] {
  const line = /\*\*Prior actions:\*\* (.*?), as you said\./.exec(content)?.[1];
  // PRIOR_ACTIONS_NO_SIGNED writes "— 09/21/2026" for a step the manager told; off, "— signed …".
  return line ? line.split("; ").map((row) => row.replace(" — signed ", " — ")) : [];
}

export const NOV14_HISTORY_LEVEL_ROWS_CASES: ReplayCase[] = [
  {
    id: "nov14-history-level-rows-every-dated-level",
    title: '"verbal warning on 9/21, written warning on 10/15. late again today" lists both',
    report: REPORT,
    status: { open: "neither earlier warning is listed" },
    fixFlags: FIX,
    async run(t) {
      const answer = await start(t).say("ca for Marnie Holloway, verbal warning on 9/21, written warning on 10/15. late again today");
      expect(priorRows(answer.content), "the rows").toEqual(["Verbal warning — 09/21/2026", "Written warning — 10/15/2026"]);
    },
  },
  {
    id: "nov14-history-level-rows-first-verbal-was",
    title: '"her first verbal was 9/21" is a Prior actions row',
    report: REPORT,
    status: { open: "no row for the earlier verbal" },
    fixFlags: FIX,
    async run(t) {
      const answer = await start(t).say("ca for Marnie Holloway, late again today. her first verbal was 9/21");
      expect(priorRows(answer.content), "the rows").toEqual(["Verbal warning — 09/21/2026"]);
    },
  },
  {
    id: "nov14-history-level-rows-listed-once",
    title: '"she had a verbal on 9/21, verbal warning on 9/21" is one row',
    report: REPORT,
    status: { open: "the same row twice" },
    fixFlags: FIX,
    async run(t) {
      const answer = await start(t).say("ca for Marnie Holloway, late again today. she had a verbal on 9/21, verbal warning on 9/21");
      expect(priorRows(answer.content), "the rows").toEqual(["Verbal warning — 09/21/2026"]);
    },
  },
  {
    id: "nov14-history-level-rows-incident-day-level",
    title: '"<W> was late on 11/12/26, verbal warning 11/12/26" is Verbal, with no Prior row for it',
    report: REPORT,
    status: { open: "the level is asked and listed as a Prior row" },
    fixFlags: FIX,
    async run(t) {
      const answer = await start(t).say("Marnie Holloway was late on 11/12/26, verbal warning 11/12/26");
      expect((answer.formProposal as { warningLevel?: string | null } | undefined)?.warningLevel ?? null, "the level").toBe("verbal");
      expect(priorRows(answer.content), "the rows").toEqual([]);
    },
  },
];
