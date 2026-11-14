import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * Gate-Sunny-3's findings on the sibling app's #970, as QA ruled them (14 Nov 2026), in this app; the person invented. F1: a
 * level dated with the incident's own day, filed the next day, is this form's level. F2: a level dated before today's
 * incident is listed under Prior actions with its date.
 */
function start(t: Parameters<ReplayCase["run"]>[0]) {
  vi.setSystemTime(new Date("2026-11-13T18:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV14_LEVEL_ON_INCIDENT_DAY_CASES: ReplayCase[] = [
  {
    id: "nov14-level-on-incident-day",
    title: '"verbal warning on 11/12/26 for Marnie Holloway, she was late that day", filed the next day, is a Verbal',
    report: "Gate-Sunny-3 on the sibling app's #970 (F1), 14 Nov 2026: a level dated with the incident's own day was read as an earlier warning",
    status: { open: "the level's date is compared with today's, so the card asks Verbal or Written" },
    fixFlags: ["LEVEL_ON_INCIDENT_DAY_ENABLED"],
    async run(t) {
      const thread = start(t);
      const answer = await thread.say("verbal warning on 11/12/26 for Marnie Holloway, she was late that day");
      expect(answer.formProposal, "no card").toBeTruthy();
      expect((answer.formProposal as { warningLevel?: string | null } | undefined)?.warningLevel ?? null, "the level").toBe("verbal");
    },
  },
  {
    id: "nov14-history-level-prior-row",
    title: '"ca for Marnie Holloway, verbal warning on 9/21. late again for 30 mins today" lists the verbal under Prior actions',
    report: "Gate-Sunny-3 on the sibling app's #970 (F2), 14 Nov 2026: the earlier verbal was read as history and listed nowhere",
    status: { open: "no Prior actions row for the earlier verbal" },
    fixFlags: ["HISTORY_LEVEL_PRIOR_ROW_ENABLED"],
    async run(t) {
      const thread = start(t);
      const answer = await thread.say("ca for Marnie Holloway, verbal warning on 9/21. late again for 30 mins today");
      expect(answer.formProposal, "no card").toBeTruthy();
      expect((answer.formProposal as { warningLevel?: string | null } | undefined)?.warningLevel ?? null, "the level").toBeNull();
      expect(answer.content, "Prior actions").toMatch(/\*\*Prior actions:\*\* Verbal warning — (?:signed )?09\/21\/2026/);
    },
  },
];
