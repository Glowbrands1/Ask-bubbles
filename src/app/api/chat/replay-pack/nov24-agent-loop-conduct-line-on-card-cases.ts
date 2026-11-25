import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";
import { PRODUCTION_MANUAL_CHUNKS } from "./nov21-agent-loop-policy-page-agrees-cases";

/**
 * ============================================================================
 * THE CARD NAMES THE STANDARDS OF CONDUCT LINE IT CITES (LOOP_CARD_CITES_CONDUCT_LINE; port from the sibling app)
 * ============================================================================
 *
 * the sibling app's QA (live test, 24 Nov 2026): "Draft a corrective action form for a till shortage for Test Employee" carded
 * the Standards of Conduct at the heading's p.12. This app already cites the line's page (U14,
 * `nov23-r2-u14-till-shortage-page-cases.ts`); with the flag on the card also names the line, "Standards of Conduct —
 * Register / Bank shortages, JBA Policy Manual p.13", and Create saves that line. The owner, the same day: "til" and
 * "missing till" are the same shortage. People invented ("Test Employee" is the sibling QA's own test name).
 */

const FIX = ["LOOP_CARD_CITES_CONDUCT_LINE_ENABLED"];
/* Fixed in production: the owner turned LOOP_CARD_CITES_CONDUCT_LINE_ENABLED on in Vercel (25 Nov 2026). */
const STATUS = "fixed" as const;
const REPORT = "the sibling app's QA (24 Nov 2026): \"Draft a corrective action form for a till shortage for Test Employee\" cited the Standards of Conduct heading, not the Register / Bank shortages line";
const TEST_EMPLOYEE = { id: "e-test-employee", firstName: "Test", lastName: "Employee", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-24T16:00:00Z"));
  t.directory([...LOOP_STAFF, TEST_EMPLOYEE as never]);
  t.as("location_manager", WEST_DODGE);
  t.manualIs!(PRODUCTION_MANUAL_CHUNKS);
}

type Card = { card?: { policy?: string | null } } | null;

const live = (account: string) =>
  loopStandIn((view): LoopDecision => {
    const card = lastResult(view, "propose_form") as Card;
    if (!card) {
      return {
        tool: "propose_form",
        input: { template_key: "dpoa", employee_id: TEST_EMPLOYEE.id, what_happened: account, policy: "Standards of Conduct", person_evidence: evidenceFrom(view, "Test Employee") },
      };
    }
    return { text: `Here's the Corrective Action Form for **Test**.\n\n**Observation of Offense:** ${account}\n\n**Policy:** ${card.card?.policy ?? ""}` };
  });

const LINE = "Standards of Conduct — Register / Bank shortages, JBA Policy Manual p.13";

const shortage = (id: string, said: string, account: string): ReplayCase => ({
  id,
  title: `"${said}": the card cites "${LINE}", and Create saves that line`,
  report: REPORT,
  status: STATUS,
  fixFlags: FIX,
  async run(t) {
    start(t);
    t.loopModel!(live(account));
    const thread = t.thread();
    const reply = await thread.say(said);
    expect(thread.proposal, `no card was made:\n${reply.content}`).not.toBeNull();
    const line = (thread.proposal as { policyLine?: string | null }).policyLine ?? "";
    expect(line, "the card's policy line").toBe(LINE);
    const id = await thread.create();
    expect(t.values(id).policy_violated, "the saved Policy Violated").toBe(line);
    expect(t.values(id).policy_language ?? "", "Create quoted no Register / Bank shortages line").toMatch(/Register \/ Bank shortages/);
  },
});

export const NOV24_AGENT_LOOP_CONDUCT_LINE_ON_CARD_CASES: ReplayCase[] = [
  shortage("nov24-loop-till-shortage-names-register-bank-line", "Draft a corrective action form for a till shortage for Test Employee", "Till shortage for Test Employee."),
  shortage("nov24-loop-til-shortage-names-register-bank-line", "ca for Test Employee, her til was short $5 on 11/22", "Her til was short $5 on 11/22."),
  shortage("nov24-loop-missing-till-names-register-bank-line", "ca for Test Employee, $20 missing from the till on 11/22", "$20 was missing from the till on 11/22."),
];
