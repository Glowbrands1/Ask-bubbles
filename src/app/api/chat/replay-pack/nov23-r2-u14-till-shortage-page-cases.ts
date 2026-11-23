import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";
import { PRODUCTION_MANUAL_CHUNKS } from "./nov21-agent-loop-policy-page-agrees-cases";

/**
 * ============================================================================
 * A TILL SHORTAGE CITES THE MANUAL'S REGISTER / BANK SHORTAGES LINE (QA's Bubbles round 2, U14; board f136)
 * ============================================================================
 *
 * The manager's turn, word for word (the person invented): "Can you make a Corrective action for Bettina Lorca for till
 * shortage. she accidentally gave a guest $20 in change when it was supposed to be $10". The card and the saved form
 * cited "Standards of Conduct Policy, JBA Policy Manual p.12": the heading's page. The manual lists the incident on its
 * own Standards of Conduct line ("Register / Bank shortages", printed p.13), and a register shortage worded that way is
 * cited there (A4, `withConductLinePage`). The card read that line only from its own account, which here says what the
 * employee did ("gave a guest $20 in change …") and never "shortage"; the manager's own words for the incident ("for till
 * shortage") name it.
 */

const REPORT = "QA's Bubbles round 2 (U14; board f136): \"… for till shortage. she accidentally gave a guest $20 in change …\" cited Standards of Conduct p.12, not the Register / Bank shortages line (p.13)";
const SAID = "Can you make a Corrective action for Bettina Lorca for till shortage. she accidentally gave a guest $20 in change when it was supposed to be $10";
const ACCOUNT = "Bettina accidentally gave a guest $20 in change when it was supposed to be $10.";
const BETTINA = { id: "e-bettina-lorca", firstName: "Bettina", lastName: "Lorca", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-17T16:00:00Z"));
  t.directory([...LOOP_STAFF, BETTINA as never]);
  t.as("location_manager", WEST_DODGE);
  t.manualIs!(PRODUCTION_MANUAL_CHUNKS);
}

type Card = { card?: { policy?: string | null } } | null;

/** The live model: the account in its own words (what she did), the policy Standards of Conduct, as the tester's run. */
const live = () =>
  loopStandIn((view): LoopDecision => {
    const card = lastResult(view, "propose_form") as Card;
    if (!card) {
      return {
        tool: "propose_form",
        input: { template_key: "dpoa", employee_id: BETTINA.id, what_happened: ACCOUNT, policy: "Standards of Conduct", person_evidence: evidenceFrom(view, "Bettina Lorca") },
      };
    }
    return { text: `Here's the Corrective Action Form for **Bettina**.\n\n**Observation of Offense:** ${ACCOUNT}\n\n**Policy:** ${card.card?.policy ?? ""}` };
  });

export const NOV23_R2_U14_TILL_SHORTAGE_PAGE_CASES: ReplayCase[] = [
  {
    id: "nov23-r2-u14-till-shortage-cites-register-line-page",
    title: `U14: "${SAID}" — the card cites Standards of Conduct p.13 (the Register / Bank shortages line), and the saved form quotes that line on the same page`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(live());
      const thread = t.thread();
      const reply = await thread.say(SAID);
      expect(thread.proposal, `no card was made (the case proves nothing):\n${reply.content}`).not.toBeNull();
      const line = (thread.proposal as { policyLine?: string | null }).policyLine ?? "";
      expect(line, `the card cites the heading's page, not the shortage line's:\n${line}`).toBe("Standards of Conduct Policy, JBA Policy Manual p.13");
      const id = await thread.create();
      expect(t.values(id).policy_language ?? "", "Create quoted no Register / Bank shortages line").toMatch(/Register \/ Bank shortages/);
      expect(t.values(id).policy_violated, "Create saved a different policy line from the card's").toBe(line);
    },
  },
];
