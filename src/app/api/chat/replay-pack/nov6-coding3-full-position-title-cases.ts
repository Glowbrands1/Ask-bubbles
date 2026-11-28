import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * THE WHOLE TYPED POSITION IS THE CARD'S POSITION (QA task A, 6 Nov 2026;
 * FULL_POSITION_TITLE_ENABLED)
 * ============================================================================
 *
 * An exit form typed as lines, "<name>\nTeam Member Part Time \n<store>\n…":
 * the card's Position was "Team Member". "Team Member Part Time" is one of this
 * company's positions (`forms/staff-picker.ts`, `isCompanyPositionTitle`), so
 * the whole of it is the Position. The negative: a title followed by words that
 * are not part of a position ("Team Member Weekends Only") is never written
 * whole; the card keeps what TITLE_ENDS_AT_LINE reads (since #497's 1266248c a
 * line that is not a company position is no title line, so no Position).
 *
 * The employee is off the roster (not in Woven): the typed title is the only
 * one there is. TITLE_ENDS_AT_LINE_ENABLED (#497) is on in the fix run too:
 * without it the store on the next line is read as another person and the card
 * has no Position at all. Names are invented and not on the directory.
 */
const EXIT_ASK = "Can you create an exit form for me?";
const FULL_TITLE =
  "Isaura Corvadine\nTeam Member Part Time \nNE Omaha Dodge\nGave notice - fulfilled notice\nGave notice 10/20/26 - date notice fulfilled 11/3/26\nResigning to pursue other career options\nStore items returned payroll deduction does not apply eligible for rehire";
const TITLE_AND_MORE =
  "Isaura Corvadine\nTeam Member Weekends Only \nNE Omaha Dodge\nGave notice - fulfilled notice\nGave notice 10/20/26 - date notice fulfilled 11/3/26\nResigning to pursue other career options\nStore items returned payroll deduction does not apply eligible for rehire";

/*
 * Changed on purpose (10 Nov 2026, QA's open-PR audit): since 9 Nov OFF_ROSTER_ASK_BEFORE_CARD (production) holds a store
 * manager's card for a name not on the roster and asks about it first, so the exit card never came. She is on the
 * roster here, with no position of her own, so the card's Position is still only what the manager typed.
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

/*
 * QA's ruling (a), 6 Nov 2026, kept under FULL_POSITION_TITLE (QA, 10 Nov 2026): "District Manager <name>" on the line
 * under the employee's name is the district manager's title, never the employee's. With production's flags the
 * read-back then kept a blank line where its Job Title line was taken out, left the Job Title off the "Left blank"
 * list, and still said "The title on the form is the one you gave (District Manager)" with no title saved.
 */
const DM_LINE = "Isaura Corvadine\nDistrict Manager Brenna Kowaldane \nNE Omaha Dodge\nGave notice - fulfilled notice\nGave notice 10/20/26 - date notice fulfilled 11/3/26\nResigning to pursue other career options\nStore items returned payroll deduction does not apply eligible for rehire";

const DM_CASE: ReplayCase = {
  id: "nov6-coding3-full-position-title-dm-line",
  title: "\"District Manager Brenna Kowaldane\" on the line under the employee's name is hers: the employee's Job Title is left blank, and the read-back says so",
  report: "QA's ruling (a), 6 Nov 2026, kept by the FULL_POSITION_TITLE fix (QA, 10 Nov 2026); the read-back must never claim a value that was not saved",
  status: { open: "the read-back keeps a blank line, leaves Job Title off the \"Left blank\" list, and says the title on the form is the one the manager gave" },
  fixFlags: ["TITLE_ENDS_AT_LINE_ENABLED", "FULL_POSITION_TITLE_ENABLED"],
  async run(t) {
    vi.setSystemTime(new Date("2026-11-06T02:00:00Z"));
    t.directory([...STAFF, ISAURA]);
    t.as("location_manager", WEST_DODGE);
    const thread = t.thread();
    await thread.say(EXIT_ASK);
    const reply = await thread.say(DM_LINE);
    expect(thread.proposal, `no exit card:\n${reply.content}`).toMatchObject({ employeeName: "Isaura Corvadine" });
    expect(thread.proposal?.employeeRole ?? null, `the card's Position:\n${reply.content}`).toBeNull();
    expect(reply.content, `the read-back claims a Job Title:\n${reply.content}`).not.toMatch(/\*\*Job Title:\*\*/i);
    expect(reply.content, `a blank line inside the read-back:\n${reply.content}`).not.toMatch(/^- \*\*Name:\*\* [^\n]*\n\n- \*\*/m);
    expect(reply.content, `the read-back says a title is on the form:\n${reply.content}`).not.toMatch(/the title on the form is the one you gave/i);
    expect(reply.content, `Job Title is not on the "Left blank" list:\n${reply.content}`).toMatch(/\*\*Left blank for you to review:\*\* Job Title\b/);
    const id = await thread.create();
    expect(t.values(id).job_title ?? null, "the saved form's Job Title").toBeNull();
  },
};

export const NOV6_CODING3_FULL_POSITION_TITLE_CASES: ReplayCase[] = [
  DM_CASE,
  {
    id: "nov6-coding3-full-position-title-exit",
    title: "An exit form typed as lines with the position \"Team Member Part Time\": the card's Position is the whole position, not \"Team Member\"",
    report: "QA task A, 6 Nov 2026: the manager typed the position \"Team Member Part Time\" on an exit form and the card's Position became \"Team Member\"",
    status: { open: "with production's flags the exit card's Position is null (TITLE_ENDS_AT_LINE off), and \"Team Member\" with it on" },
    fixFlags: ["TITLE_ENDS_AT_LINE_ENABLED", "FULL_POSITION_TITLE_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-06T02:00:00Z"));
      t.directory([...STAFF, ISAURA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say(EXIT_ASK);
      const reply = await thread.say(FULL_TITLE);
      expect(thread.proposal, `no exit card:\n${reply.content}`).toMatchObject({ employeeName: "Isaura Corvadine" });
      expect(thread.proposal?.employeeRole ?? null, `the card's Position:\n${reply.content}`).toBe("Team Member Part Time");
      // The read-back says the same title as the card.
      expect(reply.content).toMatch(/^- \*\*Job Title:\*\* Team Member Part Time$/m);
    },
  },
  {
    id: "nov6-coding3-full-position-title-negative",
    title: "Negative: \"Team Member Weekends Only\" is not one of the company's positions, so it is never the card's Position whole; the card's Position is the company position it starts with, \"Team Member\"",
    report: "QA task A, 6 Nov 2026: only a whole typed title that is a company position is kept whole",
    // Changed on purpose (QA, 10 Nov 2026): since TITLE_ENDS_AT_LINE (on) "Weekends Only" is read as the title's owner, so
    // an employee with no roster position got no Job Title at all (the reply still said "the one you gave (Team Member)").
    // QA ruled that a regression: under FULL_POSITION_TITLE the title under her name line is hers.
    status: { open: "with production's flags the card has no Position and the saved form no Job Title" },
    fixFlags: ["TITLE_ENDS_AT_LINE_ENABLED", "FULL_POSITION_TITLE_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-06T02:00:00Z"));
      t.directory([...STAFF, ISAURA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say(EXIT_ASK);
      const reply = await thread.say(TITLE_AND_MORE);
      expect(thread.proposal, `no exit card:\n${reply.content}`).toMatchObject({ employeeName: "Isaura Corvadine" });
      expect(thread.proposal?.employeeRole ?? "", `the card's Position:\n${reply.content}`).not.toMatch(/weekends only/i);
      expect(thread.proposal?.employeeRole ?? null, `the card's Position:\n${reply.content}`).toBe("Team Member");
      expect(reply.content).toMatch(/^- \*\*Job Title:\*\* Team Member$/m);
      expect(reply.content, `a blank line inside the read-back:\n${reply.content}`).not.toMatch(/^- \*\*Name:\*\* [^\n]*\n\n- \*\*/m);
      const id = await thread.create();
      expect(t.values(id).job_title ?? null, "the saved form's Job Title").toBe("Team Member");
    },
  },
];
