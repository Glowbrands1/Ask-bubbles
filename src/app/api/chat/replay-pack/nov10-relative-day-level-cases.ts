import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * QA (10 Nov 2026): RELATIVE_DATE_READER_ENABLED is live in both apps, and with it the owner's retest wording "need a CA
 * for jordan testperson. she mishandled cash at close yesterday. written warning" loses its Written level — "yesterday"
 * is read as a date before today, which made the trailing "written warning" a past step (`forms/warning-level.ts`
 * pointsToThePast). The owner-retest e2e file runs with every flag off, and no replay case carried this wording, so
 * nothing ran it in production mode. The person here is invented and on the roster.
 */
const JORDAN: DirectoryRow = {
  id: "e-jordan-testperson",
  firstName: "Jordan",
  lastName: "Testperson",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

/** A function, not an array: the registry reads exported arrays as cases. */
export function relativeDayLevelPeople(): readonly DirectoryRow[] {
  return [JORDAN];
}

export const NOV10_RELATIVE_DAY_LEVEL_CASES: ReplayCase[] = [
  {
    id: "nov10-relative-day-keeps-written",
    title: "\"need a CA for jordan testperson. she mishandled cash at close yesterday. written warning\": the card's level is Written",
    report: "Owner retest wording; QA, 10 Nov 2026: RELATIVE_DATE_READER (live) loses the level",
    status: { open: "with production's flags (RELATIVE_DATE_READER on) the card has no level: \"yesterday\" makes the trailing \"written warning\" history" },
    fixFlags: ["RELATIVE_DAY_NOT_HISTORY_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-10T15:00:00Z"));
      t.directory([...STAFF, JORDAN]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("need a CA for jordan testperson. she mishandled cash at close yesterday. written warning");
      expect(thread.proposal, `no Corrective Action card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Jordan Testperson" });
      expect((thread.proposal as { warningLevel?: string | null } | null | undefined)?.warningLevel ?? null, `the card lost the Written level:\n${reply.content}`).toBe("written");
    },
  },
];
