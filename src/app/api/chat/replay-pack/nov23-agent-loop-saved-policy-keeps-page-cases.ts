import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * THE SAVED POLICY VIOLATED IS THE LINE THE CARD SHOWS, MANUAL AND PAGE INCLUDED (QA's live re-run, 23 Nov 2026, A7 / U09)
 * ============================================================================
 *
 * The card's policy line read "<box> — <heading>, JBA Policy Manual p.<n>" and the saved Policy Violated read
 * "<box> — <heading>": a heading the form files under another Type of Offense box (`readers-line-headings.ts`) kept the
 * readers' line, without the manual and page. Since c259 the card's own line already names the box, so the saved field
 * is the card's line for every heading. Invented person (on no fixture): Tegwen Quarrington.
 */

const REPORT = "QA's live re-run (23 Nov 2026, A7 / U09): the saved policy_violated dropped \"JBA Policy Manual p.<n>\" the card showed";
const TEGWEN: DirectoryRow = { id: "e-tegwen-quarrington", firstName: "Tegwen", lastName: "Quarrington", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

async function savedFor(t: Parameters<ReplayCase["run"]>[0], said: string, heading: RegExp, account: string) {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, TEGWEN]);
  t.as("location_manager", WEST_DODGE);
  t.loopModel!(loopStandIn((view): LoopDecision => (lastResult(view, "propose_form")
    ? { text: "Here's the Corrective Action Form." }
    : {
        tool: "propose_form",
        input: {
          template_key: "dpoa", employee_id: TEGWEN.id, person_evidence: evidenceFrom(view, "Tegwen Quarrington"),
          what_happened: account, incident_date: "2026-11-21", warning_level: "verbal", level_evidence: evidenceFrom(view, "verbal"),
          payroll_deduct: "no", payroll_evidence: evidenceFrom(view, "no payroll deduct"), policy: headingWith(view, heading),
        },
      })));
  const thread = t.thread();
  await thread.say(said);
  const card = String((thread.proposal as { policyLine?: string | null } | null)?.policyLine ?? "");
  const id = await thread.create();
  return { card, saved: t.values(id).policy_violated ?? "" };
}

export const NOV23_AGENT_LOOP_SAVED_POLICY_KEEPS_PAGE_CASES: ReplayCase[] = [
  {
    id: "nov23-saved-policy-violated-keeps-manual-and-page",
    title: "A7 / U09: a verbal CA citing Care and Cleaning (filed under Standards of Conduct): the saved Policy Violated is the card's \"Standards of Conduct — Care and Cleaning …, JBA Policy Manual p.<n>\", manual and page included",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { card, saved } = await savedFor(t, "verbal CA for Tegwen Quarrington, she did not clean the soap molds after her shift on 11/21, no payroll deduct", /care and cleaning/i, "On 11/21/26 Tegwen did not clean the soap molds after her shift.");
      expect(card, "the card cites no page (the case proves nothing)").toMatch(/JBA Policy Manual p\.\d+/);
      expect(saved).toBe(card);
    },
  },
  {
    id: "nov23-saved-policy-violated-own-box-control",
    title: "Control: a verbal CA citing Attendance (its own box): the saved Policy Violated is the card's line, as before",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { card, saved } = await savedFor(t, "verbal CA for Tegwen Quarrington, she was 20 minutes late on 11/21, no payroll deduct", /^attendance/i, "On 11/21/26 Tegwen was 20 minutes late to her shift.");
      expect(card).toMatch(/JBA Policy Manual p\.\d+/);
      expect(saved).toBe(card);
    },
  },
  {
    id: "nov23-saved-policy-violated-time-records-keeps-page",
    title: "Pau's ruling (23 Nov 2026, \"add the page everywhere\"): a verbal CA citing Time Records saves the card's \"Standards of Conduct — Time Records, JBA Policy Manual p.36\", superseding f071's line without the page",
    report: REPORT,
    status: "fixed",
    async run(t) {
      /* Time Records as a manual chunk (printed page 36), the shape the draft-route tests use. */
      t.manualAlsoHas!([{ chunkIndex: 120, chunkId: "jba-120", locator: "Page 36 — Timekeeping & Payroll", page: 37, section: "Timekeeping & Payroll", printedPage: 36, sections: [{ page: 36, heading: "Timekeeping & Payroll" }, { page: 36, heading: "Time Records" }], content: "Timekeeping & Payroll\nEmployees record their own working time accurately.\nTime Records\nEmployees clock in at the start of their scheduled shift and clock out at its end, no more than a\nshort time after it unless a manager approves the extra time." }]);
      const { card, saved } = await savedFor(t, "verbal CA for Tegwen Quarrington, she stayed clocked in until 10:40 on 11/21 without approval, time records, no payroll deduct", /^time records/i, "On 11/21/26 Tegwen stayed clocked in until 10:40 without approval.");
      expect(card).toBe("Standards of Conduct — Time Records, JBA Policy Manual p.36");
      expect(saved).toBe(card);
    },
  },
];
