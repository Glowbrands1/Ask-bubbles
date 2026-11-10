import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * QA, 4 Nov 2026 (the sibling app's production, CA_SALES_POLICY_ENABLED and
 * FORM_NAME_FROM_ROSTER_ENABLED on): this multi-line request made the
 * Corrective Action card there, and no card in this app. "write me a
 * performace ca" was not read as writing the form, and the turn was answered
 * as a question. QA's exact wording (typos, two spaces before the hyphen, line
 * breaks); the person is invented and on this file's own fixture.
 */

type T = ReplayContext;

const TALISE: DirectoryRow = {
  id: "e-talise-vorn",
  firstName: "Talise",
  lastName: "Vorn",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

/** The invented person of this file (a function: the registry reads exported arrays as cases). */
export function multilinePerformancePeople(): readonly DirectoryRow[] {
  return [TALISE];
}

const SAID = "Can you write me a performace ca for an employee who did not meet their numbers for the month of october Talise Vorn  - verbal\n146 tans \nBelow in PPTA, LPSVA, Average Club, CC%, Spa%";
// WRITE_ME_THE_FORM_ENABLED (5792fa43, on in production since QA's round 4) reads "write me a … CA" as writing the form.
const FLAGS = ["WRITE_ME_THE_FORM_ENABLED"];
const REPORT = "QA, 4 Nov 2026: a multi-line \"performace ca\" request made no card here (the sibling app makes it)";

function start(t: T) {
  vi.setSystemTime(new Date("2026-11-04T23:30:00Z"));
  t.directory([...STAFF, TALISE]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV5_MULTILINE_PERFORMANCE_CA_CASES: ReplayCase[] = [
  {
    id: "nov5-multiline-performance-ca",
    title: "\"Can you write me a performace ca for an employee who … <name>  - verbal / 146 tans / Below in PPTA…\": the Corrective Action card for the person, never a metric",
    report: REPORT,
    // Changed on purpose (QA, 10 Nov 2026): fixed in production by WRITE_ME_THE_FORM_ENABLED (round 4); this file pins the wording.
    status: "fixed",
    fixFlags: FLAGS,
    async run(t) {
      const thread = start(t);
      const reply = await thread.say(SAID);
      expect(thread.proposal, `no Corrective Action card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Talise Vorn" });
      expect(reply.content, `asks what happened although the reason was given:\n${reply.content}`).not.toMatch(/haven'?t told me what happened|what happened\?/i);
    },
  },
  {
    id: "nov5-multiline-performance-ca-negative-summary",
    title: "negative control: \"can you write a summary of the corrective action policy\" makes no card",
    report: `${REPORT}, negative control`,
    status: "fixed",
    fixFlags: FLAGS,
    async run(t) {
      const thread = start(t);
      await thread.say("can you write a summary of the corrective action policy");
      expect(thread.proposal ?? null, "a card was made for a summary").toBeNull();
    },
  },
];
