import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A CA OBSERVATION THAT NAMES HER BY FIRST NAME SAYS SO (QA's r36 (in the sibling app) live check and ruling (B), 12 Nov 2026)
 * ============================================================================
 *
 * QA's wording, names invented: "create a written CA for <A>, she was 20 minutes late on 11/10, no action plan". After
 * Create, with the Observation "On November 10, 2026, <first name> arrived 20 minutes late", the notice said "The draft
 * left out <surname> in Observation of Offense", which reads as if she were missing. The dropped surname is still
 * detected (the single-writer spec); with FIRST_NAME_ENOUGH (on in production) the line says she is named by first name
 * only.
 */
const ODALYS: DirectoryRow = { id: "e-r36-odalys-pemberley", firstName: "Odalys", lastName: "Pemberley", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const notices = (replies: readonly Record<string, unknown>[]) => replies.map((reply) => String(reply.notice ?? "")).join("\n");

export const NOV12_R36_FIRST_NAME_ONLY_CASES: ReplayCase[] = [
  {
    id: "nov12-r36-ca-first-name-only-wording",
    title: "a written CA whose Observation names her by first name: the notice says so, never \"left out <surname>\"",
    report: "QA's r36 (in the sibling app) live check (12 Nov 2026), ruling (B): \"The draft left out <surname> in Observation of Offense\" with her first name there",
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-12T14:00:00Z"));
      t.directory([...STAFF, ODALYS]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("create a written CA for Odalys Pemberley, she was 20 minutes late on 11/10, no action plan");
      t.draftWrites({ observation: "On November 10, 2026, Odalys arrived 20 minutes late for her scheduled shift." });
      await thread.create();
      const said = notices(t.draftReplies!());
      expect(said, said).not.toMatch(/left out Pemberley/);
      expect(said, said).toMatch(/names the employee as Odalys only; tell me if you want the full name there\./);
    },
  },
];
