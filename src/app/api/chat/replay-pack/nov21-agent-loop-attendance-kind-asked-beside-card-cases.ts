import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * AN ATTENDANCE CA WHOSE KIND WAS NOT SAID: THE CARD, AND THE KIND ASKED BESIDE IT (QA's live re-test, 21 Nov 2026, item 25)
 * ============================================================================
 *
 * Pau's account, the agent loop on. "create ca form for <A> for violating attendance policy on 10-20-26. verbal. no
 * payroll deduct. jba manual 1-1-26 for previous coaching" got no card: the app asked "absent, late, or left early?";
 * the manager answered "verbal" (repeating) and got no card and the same question again.
 *
 * Why: propose_form refused every Corrective Action card citing Attendance that had no attendance kind
 * (attendance_not_given), so the model could only ask, and an answer that did not say the kind was refused again. The
 * refusal stays where the manager's words DESCRIBE the kind (a missed shift is never written up as lateness); where
 * they describe none, the card is made with what is known and the kind is asked once, beside it (attendance_not_said).
 *
 * The manager's turns are QA's, verbatim, with an invented person (`loop-roster.ts`): <A> Fenna Prewitt.
 */

const REPORT = "QA's live re-test (21 Nov 2026, Pau's account, agent loop on, production 3e2c30dd), item 25 (C2)";
const REQUEST = "create ca form for Fenna Prewitt for violating attendance policy on 10-20-26. verbal. no payroll deduct. jba manual 1-1-26 for previous coaching";
const KIND_QUESTION = "Was it an absence, lateness or leaving early?";

type CardOut = { card?: unknown; reason_code?: string; error?: string; facts?: { attendance_not_said?: { ask_exactly?: string; asked_before?: boolean } } } | null;

const lastSaid = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").at(-1)?.text ?? "";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-20T22:40:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

/**
 * The model, as the rules book teaches it: the card with everything the manager said (Attendance, Verbal, no payroll
 * deduct, the prior coaching), and no attendance kind, because the words give none (`attendance: undefined` on purpose:
 * the stand-in would otherwise fill "lateness", `loop-stand-in.ts`). A refusal is said back as the question the app
 * asked live; a card's own ask is said beside it.
 */
function standIn(results: CardOut[]) {
  return loopStandIn((view): LoopDecision => {
    const out = lastResult(view, "propose_form") as CardOut;
    if (out) {
      results.push(out);
      if (!out.card) return { text: "Was Fenna absent, late, or did she leave early on 10/20?" };
      const ask = out.facts?.attendance_not_said?.ask_exactly;
      return { text: `Here's the Corrective Action Form for **Fenna Prewitt**: Attendance, Verbal, no payroll deduct.${ask ? `\n\n${ask}` : ""}` };
    }
    const request = view.turns.filter((turn) => turn.role === "user").length === 1 ? 0 : 1;
    return {
      tool: "propose_form",
      input: {
        template_key: "dpoa",
        employee_id: LOOP_FENNA.id,
        person_evidence: evidenceFrom(view, "Fenna Prewitt", request),
        what_happened: "Fenna Prewitt violated the attendance policy on 10/20/26.",
        incident_date: "2026-10-20",
        policy: headingWith(view, /^attendance/i),
        warning_level: "verbal",
        level_evidence: evidenceFrom(view, "verbal", request),
        payroll_deduct: "no",
        payroll_evidence: evidenceFrom(view, "no payroll deduct", request),
        attendance: undefined,
        ...(lastSaid(view) === REQUEST ? {} : { request_evidence: [evidenceFrom(view, "create ca form for Fenna Prewitt", 1)] }),
      },
    };
  });
}

export const NOV21_AGENT_LOOP_ATTENDANCE_KIND_ASKED_BESIDE_CARD_CASES: ReplayCase[] = [
  {
    id: "nov21-agent-loop-attendance-kind-asked-beside-card",
    title: `"${REQUEST}" → "verbal": the card is made with what is known (Attendance, Verbal, no payroll deduct) and the attendance kind is asked once, beside it; never no card and the same question again`,
    report: `${REPORT}: "it asked \\"absent, late, or left early?\\"; the manager answered \\"verbal\\" (repeating) → no card, and it asked the same again"`,
    status: "fixed",
    fixFlags: ["AGENT_LOOP_ENABLED"],
    async run(t) {
      start(t);
      const results: CardOut[] = [];
      t.loopModel!(standIn(results));
      const thread = t.thread();
      const first = await thread.say(REQUEST);
      expect(results[0]?.reason_code ?? null, `the card was refused for want of the attendance kind:\n${JSON.stringify(results[0])}`).toBeNull();
      expect(thread.proposal, `no card:\n${first.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Fenna Prewitt" });
      expect((thread.proposal as { warningLevel?: string | null }).warningLevel, "the Verbal level was lost").toBe("verbal");
      expect((thread.proposal as { payrollDeduct?: string | null }).payrollDeduct, "no payroll deduct was lost").toBe("no");
      expect((thread.proposal as { attendanceKind?: string | null }).attendanceKind ?? null, "an attendance kind nobody said is on the card").toBeNull();
      expect(results[0]?.facts?.attendance_not_said?.ask_exactly, "the card does not ask the attendance kind").toBe(KIND_QUESTION);
      expect(first.content.split(KIND_QUESTION).length - 1, `the kind is not asked once, beside the card:\n${first.content}`).toBe(1);

      const second = await thread.say("verbal");
      expect(thread.proposal, `the card was lost on "verbal":\n${second.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Fenna Prewitt" });
      expect(results.every((out) => out?.reason_code !== "attendance_not_given"), "a card was refused for want of the attendance kind").toBe(true);
      // Asked once: the next card says it was asked before, and the reply does not ask the same again.
      expect(results.at(-1)?.facts?.attendance_not_said?.asked_before, "the second card does not know the kind was asked").toBe(true);
      expect(second.content, `the same question was asked again:\n${second.content}`).not.toContain(KIND_QUESTION);
    },
  },
  {
    id: "nov21-agent-loop-attendance-kind-described-still-required",
    title: "guard: \"ca for Fenna Prewitt, she did not come in on 10-20-26, attendance policy\" and the model sends no attendance kind: still refused (attendance_not_given), so a missed shift is never carded without its kind",
    report: `${REPORT}; the refusal of #1137 (an absence is never written up as lateness) stays where the words describe the kind`,
    status: "fixed",
    fixFlags: ["AGENT_LOOP_ENABLED"],
    async run(t) {
      start(t);
      const results: CardOut[] = [];
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const out = lastResult(view, "propose_form") as CardOut;
        if (out) {
          results.push(out);
          return { text: out.card ? "Here's the card." : "Was it an absence?" };
        }
        return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_FENNA.id, person_evidence: evidenceFrom(view, "Fenna Prewitt"), what_happened: "Fenna Prewitt did not come in on 10/20/26.", incident_date: "2026-10-20", policy: headingWith(view, /^attendance/i), attendance: undefined } };
      }));
      await t.thread().say("ca for Fenna Prewitt, she did not come in on 10-20-26, attendance policy");
      expect(results[0]?.reason_code, `a missed shift was carded without its kind:\n${JSON.stringify(results[0])}`).toBe("attendance_not_given");
    },
  },
];
