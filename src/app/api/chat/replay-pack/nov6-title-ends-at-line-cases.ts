import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * AN EXIT FORM TYPED AS LINES KEEPS THE EMPLOYEE'S OWN POSITION (port of the
 * sibling app's gate finding, 6 Nov 2026, s16; TITLE_ENDS_AT_LINE_ENABLED)
 * ============================================================================
 *
 * TITLE_OF_THE_EMPLOYEE_ENABLED is on in this app's production. "<name>\nTeam
 * Member Part Time \nNE Omaha Dodge\n…" gave the exit card no Position: the
 * store on the next line was read as another person beside the title. The
 * employee is off the roster (not in Woven), so the typed title is the only one
 * there is. The name is invented and not on the directory.
 */
const TURNS = [
  "Can you create an exit form for me?",
  "Thessaly Varrow\nTeam Member Part Time \nNE Omaha Dodge\nGave notice - fulfilled notice\nGave notice 9/25/26 - date notice fulfilled 10/9/26\nResigning to pursue other career options\nStore items returned payroll deduction does not apply eligible for rehire",
];

export const NOV6_TITLE_ENDS_AT_LINE_CASES: ReplayCase[] = [
  {
    id: "nov6-title-ends-at-line-exit-s16",
    title: "s16 (the sibling app's gate): an exit form typed as lines, off the roster: the card's Position is the one typed on its own line",
    report: "The sibling app's gate, 6 Nov 2026 (s16), checked in this app's production: the exit card's Position is null with TITLE_OF_THE_EMPLOYEE on",
    status: { open: "with production's flags (TITLE_OF_THE_EMPLOYEE on) the exit card's Position is null" },
    fixFlags: ["TITLE_ENDS_AT_LINE_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-06T02:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say(TURNS[0]!);
      let reply = await thread.say(TURNS[1]!);
      // Changed on purpose (flip 3, 6 Nov 2026): with the name set and OFF_ROSTER_CONFIRM in production, a name not in
      // Woven is offered ("reply **use Thessaly Varrow**") and the card is made once the manager takes it.
      if (thread.proposal?.status !== "ready" && /reply \*\*use Thessaly Varrow\*\*/.test(reply.content)) reply = await thread.say("use Thessaly Varrow");
      expect(thread.proposal, `no exit card:\n${reply.content}`).toMatchObject({ employeeName: "Thessaly Varrow" });
      // The title reader keeps "Team Member" of "Team Member Part Time" (as before TITLE_OF_THE_EMPLOYEE; a separate, older reading). The fix is that the card has one, not null.
      expect(thread.proposal?.employeeRole ?? null, `the card's Position:\n${reply.content}`).toMatch(/^Team Member/);
    },
  },
];
