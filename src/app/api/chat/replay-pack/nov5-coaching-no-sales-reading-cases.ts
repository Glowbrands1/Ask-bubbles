import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A COACHING FORM GETS NO SALES READING (QA's ruling, 5 Nov 2026, within
 * Pau's CA_SALES rule "sales/MSB Corrective Actions cite Standards of Conduct")
 * ============================================================================
 *
 * The sibling app's flag classification of CA_SALES_POLICY_ENABLED (priority
 * replay s11): a Coaching Form for a cell-phone account, after a turn
 * complaining about the app ("… created a coaching form … and reflected it
 * as underperformance and should be retraining"), cited the Standards of
 * Conduct. QA: (1) a Coaching Form does not get the sales reading; (2) a turn
 * complaining about the app is not an account of the employee. s11's shape;
 * the person is invented. The card and the draft made from it are read.
 */

const ODESSA: DirectoryRow = {
  id: "e-odessa-quintrell",
  firstName: "Odessa",
  lastName: "Quintrell",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

/** The invented person of this file (a function: the registry reads exported arrays as cases). */
export function coachingNoSalesReadingPeople(): readonly DirectoryRow[] {
  return [ODESSA];
}

export const NOV5_COACHING_NO_SALES_READING_CASES: ReplayCase[] = [
  {
    id: "nov5-coaching-cell-phone-no-sales-reading",
    title: "s11's shape: a Coaching Form for a cell-phone account cites no Standards of Conduct from an earlier complaint about the app (card and draft)",
    report: "QA, 5 Nov 2026 (the sibling app's flag classification of CA_SALES_POLICY_ENABLED, priority replay s11)",
    status: "fixed",
    fixFlags: ["CA_SALES_POLICY_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-09-29T18:00:00Z"));
      t.directory([...STAFF, ODESSA]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("create coaching form for odessa quintrell who is a team member at dodge. on 9-29-26 odessa was out of dress code");
      await thread.say("bubbles created a coaching form for an employee who was not in dress code and reflected it as underperformance and should be retraining");
      const reply = await thread.say("create a coaching form for dodge store team member, odessa quintrell, who was talking on her cell phone for 25 minutes on 9-29-26 when customers were waiting to check out");
      expect(thread.proposal, `no Coaching Form card:\n${reply.content}`).toMatchObject({ templateKey: "coaching" });
      expect(reply.content, `the sales reading on a Coaching Form:\n${reply.content}`).not.toMatch(/Standards of Conduct/i);
      t.draftWrites({ observation: "Observed:\nOn September 29, 2026, Odessa Quintrell talked on her cell phone for 25 minutes while customers waited to check out." });
      const values = t.values(await thread.create());
      const draft = Object.entries(values).map(([key, value]) => `${key}: ${value}`).join("\n");
      expect(draft, `the sales reading on the Coaching Form's draft:\n${draft}`).not.toMatch(/Standards of Conduct/i);
    },
  },
];
