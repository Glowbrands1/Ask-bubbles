import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * Ported from the sibling app: QA's round-33 live test there (12 Nov 2026). An exit form typed with labels on real line
 * breaks left the Job Title blank: "Position:" before the title was read as the title's owner. Checked here: the same.
 * The sibling tester's text in this company's position; the employee invented (on the pack's roster, no position).
 */
const ISAURA: DirectoryRow = {
  id: "e-isaura-corvadine",
  firstName: "Isaura",
  lastName: "Corvadine",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: null,
};

export const NOV12_FULL_POSITION_TITLE_LABELLED_CASES: ReplayCase[] = [
  {
    id: "nov12-full-position-title-labelled",
    title: "\"exit form / Name: <A> / Position: Team Member Part Time / Resigned 11/8\": the card's Job Title is \"Team Member\"",
    report: "Ported from the sibling app's round-33 live test, 12 Nov 2026: the labelled exit form left Job Title blank",
    status: { open: "the Job Title is left blank: \"Position:\" is read as the title's owner" },
    fixFlags: ["FULL_POSITION_TITLE_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-12T04:20:00Z"));
      t.directory([...STAFF, ISAURA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("exit form\nName: Isaura Corvadine\nPosition: Team Member Part Time\nResigned 11/8");
      expect(thread.proposal, `no exit card:\n${reply.content}`).toMatchObject({ employeeName: "Isaura Corvadine" });
      expect(thread.proposal?.employeeRole ?? null, `the card's Position:\n${reply.content}`).toBe("Team Member");
    },
  },
];
