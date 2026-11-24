import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { evidenceFrom, firstMatch, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE LOOP NEVER PUTS A FACT ON A CARD OR IN A REPLY THAT NOBODY GAVE (the loop port, QA 21 Nov 2026)
 * ============================================================================
 *
 * Ported from the sibling app's loop cases (mechanism, not content): its QA found a live model putting a warning level,
 * a payroll amount or a person on a card that the manager never typed, and echoing an amount nobody said. The loop's
 * code refuses each one, whatever the model sends: a level or payroll is kept only on evidence quoting the manager's own
 * words; a roster person is seated only when the manager's words name them; the reply's self-review never says back a
 * value the manager did not type. The stand-in plays the eager model; the route, tools and card are real. Invented
 * people only (`loop-roster.ts`).
 */

const REPORT = "QA, 21 Nov 2026 (the loop port): the sibling app's invented-facts guards, through this app's chat route";

const lastSaid = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").at(-1)?.text ?? "";
const results = (views: readonly LoopView[], tool: string) => views.flatMap((view) => view.results.filter((result) => result.tool === tool)).map((result) => result.output);

function start(t: ReplayContext, day = "2026-11-13T22:40:00Z") {
  vi.setSystemTime(new Date(day));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

/** A model that follows the rules book quotes a level or a payroll answer only where the manager's message has the words. */
function evidenceWhereQuotable(view: LoopView): Record<string, unknown> {
  const said = lastSaid(view);
  return {
    ...(/\bwritten\b/i.test(said) ? { level_evidence: evidenceFrom(view, "written") } : {}),
    ...(/\bpayroll\b/i.test(said) ? { payroll_evidence: evidenceFrom(view, "payroll deduct $50") } : {}),
  };
}

type CardOut = { reason_code?: string; ask_exactly?: string; error?: string; card?: unknown; facts?: { unset?: string[] } } | null;

export const NOV21_AGENT_LOOP_INVENTED_FACTS_CASES: ReplayCase[] = [
  {
    id: "nov21-agent-loop-no-invented-level-or-payroll",
    title: "an eager model sends Written and payroll deduct $50 that the manager never said: neither reaches the card; said in the request, both do",
    report: `${REPORT}; the sibling app's "no invented warning level or payroll" guard`,
    status: "fixed",
    async run(t) {
      start(t);
      const eager = loopStandIn((view): LoopDecision => {
        if (!lastResult(view, "find_staff")) return { tool: "find_staff", input: { name: "thaddea kroll" } };
        if (!lastResult(view, "propose_form")) {
          return {
            tool: "propose_form",
            input: { template_key: "dpoa", employee_id: firstMatch(view)?.employee_id, what_happened: "Thaddea Kroll was 30 minutes late on 11/12.", incident_date: "2026-11-12", warning_level: "written", payroll_deduct: "yes", payroll_amount: "50", ...evidenceWhereQuotable(view) },
          };
        }
        return { text: "Here is the Corrective Action Form for **Thaddea Kroll**." };
      });
      t.loopModel!(eager);
      const unstated = t.thread();
      await unstated.say("ca for thaddea kroll, she was 30 minutes late on 11/12");
      expect(unstated.proposal, "no card was made (the case proves nothing)").not.toBeNull();
      expect(unstated.proposal?.employeeName).toBe("Thaddea Kroll");
      expect((unstated.proposal as { warningLevel?: string | null } | null)?.warningLevel ?? null, "a level nobody stated is on the card").toBeNull();
      expect((unstated.proposal as { payrollDeduct?: string | null } | null)?.payrollDeduct ?? null, "payroll nobody stated is on the card").toBeNull();
      expect((unstated.proposal as { payrollDeductAmount?: string | null } | null)?.payrollDeductAmount ?? null, "an amount nobody stated is on the card").toBeNull();

      const stated = t.thread();
      await stated.say("written ca for thaddea kroll, she was 30 minutes late on 11/12, payroll deduct $50");
      expect((stated.proposal as { warningLevel?: string | null } | null)?.warningLevel, "the stated level was dropped").toBe("written");
      expect(stated.proposal as unknown, "the stated payroll was dropped").toMatchObject({ payrollDeduct: "yes", payrollDeductAmount: "50" });
    },
  },
  {
    id: "nov21-agent-loop-reply-never-echoes-an-untyped-amount",
    title: "a Coaching card, \"edit fenna prewitt ca\", then a bare \"yes\": the model's reply claims \"Payroll deduction amount: $20\" (nobody typed it); the final reply never says $20 and asks \"Is payroll deduct applicable, and how much?\", and nothing is set on the card",
    report: `${REPORT}; the sibling app's pre-launch live re-test (16 Nov 2026), a bare "yes" answered with an invented $20`,
    status: "fixed",
    async run(t) {
      start(t, "2026-11-15T22:40:00Z");
      const model = loopStandIn((view): LoopDecision => {
        const said = lastSaid(view);
        const card = lastResult(view, "propose_form") as CardOut;
        const base = { employee_id: LOOP_FENNA.id, what_happened: "Fenna Prewitt was late on 11/12.", incident_date: "2026-11-12" };
        if (/^coaching/i.test(said)) return card ? { text: "Here's the Coaching Form for **Fenna Prewitt**." } : { tool: "propose_form", input: { template_key: "coaching", ...base } };
        if (/^edit/i.test(said)) return card ? { text: `Here's the Corrective Action Form for **Fenna Prewitt**.${card.facts?.unset?.length === 2 ? " Payroll deduct and warning level aren't set; tell me if they apply." : ""}` } : { tool: "propose_form", input: { template_key: "dpoa", ...base, form_change_evidence: evidenceFrom(view, "edit fenna prewitt ca") } };
        // The bare "yes": passed whole as payroll and level evidence, with an amount nobody typed, then claimed in the reply.
        if (!card) return { tool: "propose_form", input: { template_key: "dpoa", ...base, payroll_deduct: "yes", payroll_amount: "20", payroll_evidence: evidenceFrom(view, said), warning_level: "verbal", level_evidence: evidenceFrom(view, said) } };
        return { text: "Updated the Corrective Action Form for **Fenna Prewitt**.\n\n**Is payroll deduct applicable?** Yes, as you said.\n**Payroll deduction amount:** $20" };
      });
      t.loopModel!(model);
      const thread = t.thread();
      await thread.say("coaching for fenna prewitt, late on 11/12");
      await thread.say("edit fenna prewitt ca");
      expect(thread.proposal?.templateKey, "the Corrective Action card was not made (the case proves nothing)").toBe("dpoa");
      const reply = await thread.say("yes");
      const out = results(model.views, "propose_form").at(-1) as { card?: { payroll_deduct?: unknown; payroll_amount?: unknown; warning_level?: unknown } };
      expect(out.card?.payroll_amount ?? null, "an amount nobody typed reached the card").toBeNull();
      expect((thread.proposal as { payrollDeductAmount?: string | null } | null)?.payrollDeductAmount ?? null, "an amount nobody typed is on the card").toBeNull();
      expect(reply.content, `the reply echoed an amount the manager never typed:\n${reply.content}`).not.toMatch(/\$\s*20\b|\b20\b/);
      expect(reply.content).toContain("Is payroll deduct applicable, and how much?");
    },
  },
  {
    id: "nov21-agent-loop-person-not-named-not-seated",
    title: "\"ca for the new girl at the register, she was late on 11/18\": the model seats a roster person nobody named (by id, then by a roster name it typed itself): refused (person_not_named) both ways, no card, and the reply asks who the form is for",
    report: `${REPORT}; the sibling app's QA item 8 (20 Nov 2026): a roster person the manager never named was put on a card`,
    status: "fixed",
    async run(t) {
      start(t, "2026-11-19T22:40:00Z");
      for (const by of ["id", "name"] as const) {
        const model = loopStandIn((view): LoopDecision => {
          const card = lastResult(view, "propose_form") as CardOut;
          if (!card) return { tool: "propose_form", input: { template_key: "dpoa", ...(by === "id" ? { employee_id: LOOP_THADDEA.id } : { employee_name: "Thaddea Kroll" }), what_happened: "Late on 11/18.", incident_date: "2026-11-18" } };
          return { text: card.card ? "Here's the Corrective Action Form for **Thaddea Kroll**." : card.ask_exactly ?? card.error ?? "" };
        });
        t.loopModel!(model);
        const reply = await t.thread().say("ca for the new girl at the register, she was late on 11/18");
        const first = results(model.views, "propose_form")[0] as CardOut;
        expect(first?.reason_code, `by ${by}: the unnamed person was seated:\n${JSON.stringify(first)}`).toBe("person_not_named");
        expect(reply.formProposal ?? null, `by ${by}: a card was shown:\n${reply.content}`).toBeNull();
        expect(reply.content, `by ${by}: the reply does not ask who`).toMatch(/Who is this .* for\?/);
      }
      // Control: her whole first name, said by the manager, seats her.
      const named = loopStandIn((view): LoopDecision => {
        if (!lastResult(view, "propose_form")) return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_THADDEA.id, what_happened: "Late on 11/18.", incident_date: "2026-11-18", person_evidence: evidenceFrom(view, "thaddea") } };
        return { text: "Here's the Corrective Action Form for **Thaddea Kroll**." };
      });
      t.loopModel!(named);
      const thread = t.thread();
      await thread.say("ca for thaddea, she was late on 11/18");
      expect(thread.proposal?.employeeName, "the person the manager named was not seated").toBe("Thaddea Kroll");
    },
  },
];
