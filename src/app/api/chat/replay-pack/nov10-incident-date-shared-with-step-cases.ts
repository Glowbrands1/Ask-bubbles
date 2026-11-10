import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * THE DAY A STEP WAS GIVEN IS ALSO THE INCIDENT'S DAY (QA's prod-env reading, 10 Nov 2026, D3;
 * INCIDENT_DATE_SHARED_WITH_STEP_ENABLED)
 * ============================================================================
 *
 * With production's flags, "verbal for <name>, gave her a verbal on 10-21 for being late on 10-21" and "ca for <name>,
 * she was late on 10-21 and i gave her a verbal on 10-21" kept no incident date (FORM_EDIT_DATE_RULES sets aside every
 * date that is also a step's), so the form was dated today. The wording is the NEVER-BREAK rows' in
 * `forms/form-date-incident-only.test.ts`; the person is invented.
 */
const PERLA: DirectoryRow = {
  id: "e-perla-quist-d3",
  firstName: "Perla",
  lastName: "Quist",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

const FIX = ["INCIDENT_DATE_SHARED_WITH_STEP_ENABLED"];
const REPORT = "QA's prod-env reading (10 Nov 2026, D3): the incident date dropped because a step was given the same day";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-10-25T15:00:00Z"));
  t.directory([...STAFF, PERLA]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV10_INCIDENT_DATE_SHARED_WITH_STEP_CASES: ReplayCase[] = [
  {
    id: "nov10-incident-date-shared-with-step-for-being-late",
    title: "\"gave her a verbal on 10-21 for being late on 10-21\": the card is dated 10-21",
    report: REPORT,
    status: { open: "the card is not dated 10-21" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("verbal for perla quist, gave her a verbal on 10-21 for being late on 10-21");
      expect(thread.proposal, `no card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa" });
      expect(thread.proposal?.formDate, `the incident date is lost:\n${reply.content}`).toBe("2026-10-21");
    },
  },
  {
    id: "nov10-incident-date-shared-with-step-late-then-verbal",
    title: "\"she was late on 10-21 and i gave her a verbal on 10-21\": the card is dated 10-21",
    report: REPORT,
    status: { open: "the card is not dated 10-21" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("ca for perla quist, she was late on 10-21 and i gave her a verbal on 10-21");
      expect(thread.proposal, `no card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa" });
      expect(thread.proposal?.formDate, `the incident date is lost:\n${reply.content}`).toBe("2026-10-21");
    },
  },
];
