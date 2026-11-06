import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

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
 * are not part of a position ("Team Member Weekends Only") stays as today.
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

export const NOV6_CODING3_FULL_POSITION_TITLE_CASES: ReplayCase[] = [
  {
    id: "nov6-coding3-full-position-title-exit",
    title: "An exit form typed as lines with the position \"Team Member Part Time\": the card's Position is the whole position, not \"Team Member\"",
    report: "QA task A, 6 Nov 2026: the manager typed the position \"Team Member Part Time\" on an exit form and the card's Position became \"Team Member\"",
    status: { open: "with production's flags the exit card's Position is null (TITLE_ENDS_AT_LINE off), and \"Team Member\" with it on" },
    fixFlags: ["TITLE_ENDS_AT_LINE_ENABLED", "FULL_POSITION_TITLE_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-06T02:00:00Z"));
      t.directory(STAFF);
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
    title: "Negative: \"Team Member Weekends Only\" is not one of the company's positions, so the card's Position stays \"Team Member\" as today",
    report: "QA task A, 6 Nov 2026: only a whole typed title that is a company position is kept whole",
    status: { open: "with production's flags the exit card's Position is null (TITLE_ENDS_AT_LINE off)" },
    fixFlags: ["TITLE_ENDS_AT_LINE_ENABLED", "FULL_POSITION_TITLE_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-06T02:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say(EXIT_ASK);
      const reply = await thread.say(TITLE_AND_MORE);
      expect(thread.proposal, `no exit card:\n${reply.content}`).toMatchObject({ employeeName: "Isaura Corvadine" });
      expect(thread.proposal?.employeeRole ?? null, `the card's Position:\n${reply.content}`).toBe("Team Member");
      expect(reply.content).toMatch(/^- \*\*Job Title:\*\* Team Member$/m);
    },
  },
];
