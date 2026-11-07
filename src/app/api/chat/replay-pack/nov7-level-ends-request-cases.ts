import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * "<NAME> WAS LATE ON 10-20-26, VERBAL CA" IS A REQUEST FOR A VERBAL CA (QA, live tester, 7 Nov 2026)
 * ============================================================================
 *
 * The manager's words (the employee invented): "my team member <name> was late on 10-20-26, verbal ca". No card:
 * the closing "verbal ca" had no request words before it, so the level read as history and the turn as a
 * question, answered with a policy reply. "verbal ca for Team Member, <name>. on 10-20-26 she was late to her
 * shift" gave the card. LEVEL_ENDS_REQUEST_ENABLED (`forms/warning-level.ts`).
 */

const WRENNA: DirectoryRow = {
  id: "e-wrenna-calloway-level",
  firstName: "Wrenna",
  lastName: "Calloway",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

export const NOV7_LEVEL_ENDS_REQUEST_CASES: ReplayCase[] = [
  {
    id: "nov7-level-ends-request",
    title: "\"my team member <name> was late on 10-20-26, verbal ca\" opens a Corrective Action card, Verbal Warning",
    report: "QA, live tester, 7 Nov 2026",
    status: { open: "the closing \"verbal ca\" reads as history, so the turn is answered as a question with no card" },
    fixFlags: ["LEVEL_ENDS_REQUEST_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-06T14:00:00Z"));
      t.directory([...STAFF, WRENNA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("my team member Wrenna Calloway was late on 10-20-26, verbal ca");
      expect(thread.proposal, "no CA card for Wrenna Calloway").toMatchObject({ templateKey: "dpoa", employeeName: "Wrenna Calloway" });
      expect(reply.content, "the card does not say Verbal Warning").toMatch(/Verbal Warning/);
      t.draftWrites({ observation: "Observed:\nWrenna Calloway was late on 10/20/2026." });
      const id = await thread.create();
      expect(t.checked(id).warning_type ?? [], "Verbal Warning is not ticked").toContain("verbal");
    },
  },
];
