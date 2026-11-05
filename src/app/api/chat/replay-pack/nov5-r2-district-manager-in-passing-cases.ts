import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayAnswer, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * R2 (QA, 5 Nov 2026; a store manager's production chat, flags off)
 * ============================================================================
 *
 * The shape, with every person invented: "create a ca form for <employee, a
 * three-word name>", then one long turn that tells ONE employee's
 * story, names their district manager twice in passing, and asks for a
 * verbal warning. With the full conversation the card's employee is right;
 * two defects remain:
 *
 *   1. the card's Position is "District Manager" — the OTHER person's, read
 *      from the story. The employee is a Team Member.
 *   2. What happened (the card's Issue) is the first fragment only, "verbal
 *      warning The date she complained was Oct 31st"; the complaint itself
 *      (rude to a customer) is missing.
 *
 * OPEN with production's flags, no fix yet. The second test runs the same
 * turns with FORM_NAME_FROM_ROSTER_ENABLED + CA_SALES_POLICY_ENABLED on (the
 * flip): recorded 5 Nov 2026, it does not change either defect.
 */

const person = (id: string, firstName: string, lastName: string, positionName: string): DirectoryRow => ({
  id,
  firstName,
  lastName,
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName,
});

const ODESSA = person("e-odessa-farrow-lindqvist", "Odessa", "Farrow Lindqvist", "Team Member Part Time");
const BRENNA = person("e-brenna-kowalski-dane", "Brenna", "Kowaldane", "District Manager");

const REPORT = "QA, 5 Nov 2026, R2 (a store manager's production chat, flags off, full conversation)";

// The live turn had a typo in the name; QA's full-conversation replay has the employee right, so the name is spelled as the roster has it.
const T1 = "create a ca form for Odessa Farrow Lindqvist";
const T2 =
  "verbal warning The date she complained was Oct 31st . The customer said she was giving her an attitude when she brought up that the register was charging for scent in her laundry refills and it has never done that before. When Odessa spoke with District manager Brenna Kowaldane on the phone about how to fix this, Odessa told the customer that she was making her job really hard. The customer reached out to district manager Brenna Kowaldane saying Odessa was very rude to her and Odessa told her she knows how to do her job she has worked here for two years. no payroll deduct.";

/** The card's Issue line, or "". */
function issueLine(reply: ReplayAnswer): string {
  return reply.content.split("\n").find((line) => /\*\*Issue:?\*\*/i.test(line)) ?? "";
}

async function run(t: Parameters<ReplayCase["run"]>[0]) {
  vi.setSystemTime(new Date("2026-11-03T21:00:00Z"));
  t.directory([...STAFF, ODESSA, BRENNA]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  await thread.say(T1);
  const reply = await thread.say(T2);
  expect(thread.proposal, `no CA card for Odessa Farrow Lindqvist:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Odessa Farrow Lindqvist" });
  expect(thread.proposal?.employeeRole ?? "", "the Position is the district manager's").not.toMatch(/district manager/i);
  expect(issueLine(reply), `What happened is only the first fragment:\n${issueLine(reply)}`).toMatch(/rude|attitude/i);
}

export const NOV5_R2_DISTRICT_MANAGER_IN_PASSING_CASES: ReplayCase[] = [
  {
    id: "nov5-r2-dm-in-passing-position-and-account",
    title: "R2: one employee's story naming their district manager in passing: the Position is the employee's, never \"District Manager\"; What happened carries the complaint, not just \"verbal warning The date she complained was Oct 31st\"",
    report: `${REPORT}: Position "District Manager" from the other person; What happened truncated to "verbal warning The date she complained was Oct 31st"`,
    status: { open: "the card's Position is \"District Manager\" (the other person's) and What happened is \"verbal warning The date she complained was Oct 31st\"" },
    run,
  },
  {
    id: "nov5-r2-dm-in-passing-with-the-flip",
    title: "R2 with FORM_NAME_FROM_ROSTER_ENABLED + CA_SALES_POLICY_ENABLED on: the same two checks",
    report: `${REPORT}: does the sales flip change it?`,
    // Recorded 5 Nov 2026: the flip only drops the "When Odessa" not-on-roster note; both defects stand.
    status: { open: "with the flip's flags too: Position \"District Manager\" and What happened \"verbal warning The date she complained was Oct 31st\"" },
    async run(t) {
      vi.stubEnv("FORM_NAME_FROM_ROSTER_ENABLED", "true");
      vi.stubEnv("CA_SALES_POLICY_ENABLED", "true");
      try {
        await run(t);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  },
];
