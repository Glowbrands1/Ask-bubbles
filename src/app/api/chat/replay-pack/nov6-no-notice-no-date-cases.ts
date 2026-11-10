import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";
import { answerOffRosterAsk } from "./off-roster-answer";

/**
 * QA, flip-3 tester, 6 Nov 2026 (B): "exit form for <X>, resigned 11-3-26 with no notice, not eligible
 * for rehire" said "Date that notice was given: November 3, 2026". NO_NOTICE_NO_DATE_ENABLED leaves the
 * notice date empty when the manager says no notice was given. The person is invented and not on
 * either directory.
 */
export const NOV6_NO_NOTICE_NO_DATE_CASES: ReplayCase[] = [
  {
    id: "nov6-no-notice-no-date-resigned",
    title: "\"exit form for <X>, resigned 11-3-26 with no notice, not eligible for rehire\": no notice date, and the resignation date stays",
    report: "QA, 6 Nov 2026 (flip-3 tester, B): \"no notice\" still got a notice date on the exit form",
    status: { open: "with production's flags the card says \"Date that notice was given: November 3, 2026\"" },
    fixFlags: ["NO_NOTICE_NO_DATE_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-06T15:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      // Changed on purpose (9 Nov 2026, the off-roster switch-on: OFF_ROSTER_ASK_BEFORE_CARD, Pau's "on" via QA): the name is
      // on no roster here, so a store manager is asked about it first; "use <name>" makes the card, and every assertion
      // below holds on that card turn (`off-roster-answer.ts`).
      const thread = t.thread();
      const reply = await answerOffRosterAsk(thread, await thread.say("exit form for Peregrine Ashcombe, resigned 11-3-26 with no notice, not eligible for rehire"), "Peregrine Ashcombe");
      expect(reply.content, "a notice date the manager never gave").not.toMatch(/\*\*Date that notice was given:\*\*/i);
      expect(reply.content, "the resignation date is lost").toMatch(/Resignation Date:\*\* November 3, 2026/);
    },
  },
];
