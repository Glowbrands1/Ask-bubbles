import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * "FOR FAILURE TO OPEN ON TIME" IS WHAT HAPPENED (ported from the sibling app, 10 Nov 2026)
 * ============================================================================
 *
 * The sibling app's manager's words, verbatim except the person (invented: Corisande Pell). There the card asked
 * "You haven't told me what happened yet"; here it had an empty Issue, cited no policy and planned "the applicable
 * company policy": no reader took "failure to open on time" as an account. It is a late opening.
 * FAILURE_TO_OPEN_IS_LATE_OPENING_ENABLED.
 */

const CORISANDE: DirectoryRow = {
  id: "e-fo-corisande-pell",
  firstName: "Corisande",
  lastName: "Pell",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

/** The invented person of this file (a function: the registry reads exported arrays as cases). */
export function failureToOpenPeople(): readonly DirectoryRow[] {
  return [CORISANDE];
}

export const NOV10_FAILURE_TO_OPEN_CASES: ReplayCase[] = [
  {
    id: "nov10-p16-failure-to-open-is-what-happened",
    title: "\"Can you make a CA for <name> for failure to open on time?\": the card cites Late Opening and plans on it",
    report: 'QA, 10 Nov 2026 (the sibling app\'s P16): "Can you make a CA for <name> for failure to open on time?"',
    status: { open: "the card's Issue is empty, it cites no policy, and its plan reviews \"the applicable company policy\"" },
    fixFlags: ["FAILURE_TO_OPEN_IS_LATE_OPENING_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-09T16:54:00Z"));
      t.directory([...STAFF, CORISANDE]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("Can you make a CA for Corisande Pell for failure to open on time?");
      expect(thread.proposal, `no CA card for Corisande Pell:\n${reply.content}`).toMatchObject({ employeeName: "Corisande Pell" });
      expect(reply.content, "the card does not cite Late Opening").toMatch(/Late Opening/);
      expect(reply.content, "the plan reviews no named policy").not.toMatch(/review the applicable company policy/i);
    },
  },
  {
    id: "nov10-failure-to-open-control-name-only",
    title: "control: \"Can you make a CA for <name>?\" with no reason cites no Late Opening",
    report: "coding 6, 10 Nov 2026: FAILURE_TO_OPEN_IS_LATE_OPENING_ENABLED's negative control",
    status: "fixed",
    fixFlags: ["FAILURE_TO_OPEN_IS_LATE_OPENING_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-09T16:54:00Z"));
      t.directory([...STAFF, CORISANDE]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("Can you make a CA for Corisande Pell?");
      expect(reply.content).not.toMatch(/Late Opening/);
    },
  },
];
