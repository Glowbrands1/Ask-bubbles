import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * TWO POLICIES ON THE CARD ARE SAVED AS THE CARD SHOWS THEM (port from the sibling app, its QA's f094, 21 Nov 2026 live
 * retest)
 * ============================================================================
 *
 * The card listed two policies joined by ";"; the saved Policy Violated did not match it: a second heading with no Type
 * of Offense box of its own (Time Records, filed under Standards of Conduct) was dropped. A Corrective Action card citing
 * an Attendance heading and Time Records, then Create: the saved Policy Violated is the card's line. Invented person (on
 * no fixture): Ottilde Haverleigh.
 */

const REPORT = "Sibling app QA's f094 (21 Nov 2026 live retest): the card joined two policies with \";\" and the saved form did not match it";
const OTTILDE: DirectoryRow = { id: "e-ottilde-haverleigh", firstName: "Ottilde", lastName: "Haverleigh", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const ACCOUNT = "On 11/21/26 Ottilde was 25 minutes late to her shift and stayed clocked in until 10:40 without approval.";
const TIME_RECORDS = { chunkIndex: 120, chunkId: "jba-120", locator: "Page 36 — Timekeeping & Payroll", page: 37, section: "Timekeeping & Payroll", printedPage: 36, sections: [{ page: 36, heading: "Timekeeping & Payroll" }, { page: 36, heading: "Time Records" }], content: "Timekeeping & Payroll\nEmployees record their own working time accurately.\nTime Records\nEmployees clock in at the start of their scheduled shift and clock out at its end, no more than a\nshort time after it unless a manager approves the extra time." };

export const NOV23_AGENT_LOOP_TWO_POLICIES_SAVED_AS_CARD_CASES: ReplayCase[] = [
  {
    id: "nov23-f094-two-policies-saved-as-the-card-shows",
    title: "f094 (port): a written CA card citing an Attendance heading and Time Records: the saved Policy Violated is the card's line, both policies, joined as the card joins them",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF, OTTILDE]);
      t.as("location_manager", WEST_DODGE);
      t.manualAlsoHas!([TIME_RECORDS]);
      t.loopModel!(loopStandIn((view): LoopDecision => (lastResult(view, "propose_form")
        ? { text: "Here's the Corrective Action Form." }
        : {
            tool: "propose_form",
            input: {
              template_key: "dpoa", employee_id: OTTILDE.id, person_evidence: evidenceFrom(view, "Ottilde Haverleigh"),
              what_happened: ACCOUNT, incident_date: "2026-11-21", warning_level: "written", level_evidence: evidenceFrom(view, "written"),
              payroll_deduct: "no", payroll_evidence: evidenceFrom(view, "no payroll deduct"), policy: `${headingWith(view, /^attendance/i)}; Time Records`,
            },
          })));
      const thread = t.thread();
      const reply = await thread.say("written CA for Ottilde Haverleigh, she was 25 minutes late on 11/21 and stayed clocked in until 10:40 without approval, no payroll deduct");
      const card = String((thread.proposal as { policyLine?: string | null } | null)?.policyLine ?? "");
      expect(card, `the card does not cite both policies (the case proves nothing):\n${reply.content}`).toMatch(/;\s*.*Time Records/);
      const id = await thread.create();
      expect(t.values(id).policy_violated ?? "").toBe(card);
    },
  },
];
