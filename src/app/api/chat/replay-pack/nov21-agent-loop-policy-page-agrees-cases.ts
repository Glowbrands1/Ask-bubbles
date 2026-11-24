import { expect, vi } from "vitest";

import manual151 from "@/test/fixtures/jba-manual-production-151.json";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * THE CARD'S POLICY PAGE AND THE QUOTED POLICY UNDER IT AGREE (QA's live re-test, 21 Nov 2026, item 6 / A4)
 * ============================================================================
 *
 * QA, on Pau's account with the agent loop on (production 3e2c30dd): "Policy page mismatch: the card's policy line says
 * p.12 but the quoted policy text under it says p.13." The manager asked for a register shortage write-up. The manual
 * lists "Register or bank shortages" on the Standards of Conduct's own line on printed page 13, under the heading printed
 * on page 12; Create quotes that line and cites p.13 (`withConductLinePage`, POLICY_SPECIFIC_TOPICS), while the loop's
 * card named the heading's page. One rule for both: a Standards of Conduct incident the manual lists on its own line is
 * cited on that line's printed page, on the card as on the form. Invented people (`loop-roster.ts`).
 */

const REPORT = "QA's live re-test (21 Nov 2026, item 6 / A4, Pau's account, agent loop on): the card's policy line says p.12 but the quoted policy text under it says p.13";
const SAID = "create ca form for Fenna Prewitt. Fenna Prewitt had a register shortage of $3.25 on 10-20-26. payroll deduct of $3.25 is applicable";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T16:40:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

/** The production manual's rows (`test/fixtures/jba-manual-production-151.json`), as `fetchOfficialPolicyManual` returns them. */
export const PRODUCTION_MANUAL_CHUNKS: readonly Record<string, unknown>[] = manual151.chunks.map((row) => ({
  chunkIndex: row.chunk_index,
  chunkId: `prod-${row.chunk_index}`,
  locator: row.locator,
  page: row.page,
  content: row.content,
  section: row.section,
  printedPage: (row.metadata as { printedPage?: number | null }).printedPage ?? null,
  sections: (row.metadata as { sections?: unknown }).sections ?? [],
}));

type Card = { card?: { policy?: string | null } } | null;

export const NOV21_AGENT_LOOP_POLICY_PAGE_AGREES_CASES: ReplayCase[] = [
  {
    id: "nov21-agent-loop-register-shortage-policy-page-agrees",
    title: `"${SAID}": the card cites Standards of Conduct on the page of the manual line Create quotes (p.13), and the saved Direct policy quotes that line with the same page`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      t.manualIs!(PRODUCTION_MANUAL_CHUNKS);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (!lastResult(view, "find_staff")) return { tool: "find_staff", input: { name: "Fenna Prewitt" } };
        const card = lastResult(view, "propose_form") as Card;
        if (!card) {
          return {
            tool: "propose_form",
            input: {
              template_key: "dpoa",
              employee_id: LOOP_FENNA.id,
              what_happened: "Fenna Prewitt had a register shortage of $3.25 on 10-20-26.",
              incident_date: "2026-10-20",
              policy: "Standards of Conduct",
              payroll_deduct: "yes",
              payroll_amount: "3.25",
              payroll_evidence: evidenceFrom(view, "payroll deduct of $3.25 is applicable"),
              person_evidence: evidenceFrom(view, "Fenna Prewitt"),
            },
          };
        }
        if (!card.card) return { text: JSON.stringify(card) };
        return { text: `Here's the Corrective Action Form for **Fenna Prewitt**.\n\n**Observation of Offense:** Fenna Prewitt had a register shortage of $3.25 on 10-20-26.\n\n**Policy:** ${card.card?.policy ?? ""}` };
      }));
      const thread = t.thread();
      const reply = await thread.say(SAID);
      expect(thread.proposal, `no card was made (the case proves nothing):\n${reply.content}`).not.toBeNull();
      const line = (thread.proposal as { policyLine?: string | null }).policyLine ?? "";
      expect(line, "the card cites no Standards of Conduct").toMatch(/^Standards of Conduct Policy, JBA Policy Manual p\.\d+/);
      const cardPage = /p\.(\d+)/.exec(line)?.[1];

      const id = await thread.create();
      const direct = t.values(id).policy_language ?? "";
      expect(direct, "Create quoted no Standards of Conduct line for the shortage").toMatch(/Register \/ Bank shortages/);
      const formPage = /Source: JBA Policy Manual — Standards of Conduct, p\. (\d+)/.exec(direct)?.[1];
      expect(formPage, `the saved Direct policy names no page:\n${direct}`).toBeDefined();
      expect(cardPage, `the card says p.${cardPage} but the quoted policy under it says p.${formPage}:\ncard: ${line}\nform: ${direct}`).toBe(formPage);
      expect(cardPage, "the quoted line is on printed page 13").toBe("13");
      expect(t.values(id).policy_violated, "Create saved a different policy line from the card's").toBe(line);
      expect(reply.content).toContain(`**Policy:** ${line}`);
    },
  },
  {
    id: "nov21-agent-loop-heading-incident-keeps-heading-page",
    title: "control: \"ca for Fenna Prewitt, she was rude to a guest on 11/12\" is the Standards of Conduct heading itself (no listed line), so the card keeps the heading's page, p.12",
    report: `${REPORT}; the control: only a listed line moves the page`,
    status: "fixed",
    async run(t) {
      start(t);
      t.manualIs!(PRODUCTION_MANUAL_CHUNKS);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const card = lastResult(view, "propose_form") as Card;
        if (!card) return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_FENNA.id, what_happened: "Fenna Prewitt was rude to a guest on 11/12.", incident_date: "2026-11-12", policy: "Standards of Conduct", person_evidence: evidenceFrom(view, "Fenna Prewitt") } };
        return { text: card.card ? `Here's the Corrective Action Form for **Fenna Prewitt**.\n\n**Policy:** ${card.card.policy ?? ""}` : JSON.stringify(card) };
      }));
      const thread = t.thread();
      const reply = await thread.say("ca for Fenna Prewitt, she was rude to a guest on 11/12");
      expect(thread.proposal, `no card was made (the case proves nothing):\n${reply.content}`).not.toBeNull();
      expect((thread.proposal as { policyLine?: string | null }).policyLine).toBe("Standards of Conduct Policy, JBA Policy Manual p.12");
    },
  },
];
