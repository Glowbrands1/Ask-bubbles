import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * A TERMINATION "EFFECTIVE IMMEDIATELY" IS DATED TODAY (Pau's ruling, 24 Nov 2026, via QA)
 * ============================================================================
 *
 * In Pau's words: "effective immediately for termination - should be dated today". An exit the manager states as a
 * termination effective immediately is dated today, and its effective date is today: never blank, never asked for
 * again, never another day (a no-show date or the last day worked). A termination with its own stated effective date
 * keeps that date (control). Every person invented.
 */

const REPORT = "Pau's ruling (24 Nov 2026, via QA): \"effective immediately for termination - should be dated today\"";
const ORLA: DirectoryRow = { id: "e-orla-penhallow", firstName: "Orla", lastName: "Penhallow", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const TODAY = "2026-11-24";

type Card = { card?: { form_date?: string | null; reads_back?: string[] }; facts?: Record<string, unknown>; reason_code?: string } | null;

/** The exit card for Orla as a termination; `effective`: the effective_date the model passes (as a live model may). */
async function terminate(t: ReplayContext, said: string, effective?: string) {
  vi.setSystemTime(new Date(`${TODAY}T18:00:00Z`));
  t.directory([...LOOP_STAFF, ORLA]);
  t.as("location_manager", WEST_DODGE);
  const results: Card[] = [];
  t.loopModel!(loopStandIn((view): LoopDecision => {
    const result = lastResult(view, "propose_form") as Card;
    if (result) {
      results.push(result);
      return { text: result.card ? "Here's the Resignation/Exit Form for **Orla**." : `refused: ${result.reason_code}` };
    }
    return {
      tool: "propose_form",
      input: {
        template_key: "resignation-exit", employee_id: ORLA.id, exit_type: "termination",
        exit_evidence: { ...evidenceFrom(view, "terminate Orla Penhallow"), kind: "asks_for_exit_form" },
        person_evidence: evidenceFrom(view, "Orla Penhallow"),
        what_happened: "Orla was terminated effective immediately.",
        ...(effective ? { effective_date: effective } : {}),
      },
    };
  }), { scripted: true });
  const thread = t.thread();
  const reply = await thread.say(said);
  return { thread, reply, results };
}

const today = (thread: { readonly proposal: { formDate?: string | null } | null | undefined }, content: string) =>
  expect(thread.proposal?.formDate ?? null, `the termination effective immediately is not dated today:\n${content}`).toBe(TODAY);

export const NOV24_AGENT_LOOP_TERMINATION_EFFECTIVE_IMMEDIATELY_CASES: ReplayCase[] = [
  {
    id: "nov24-termination-effective-immediately-dated-today",
    title: "\"terminate Orla Penhallow effective immediately\": the exit card is dated today (its effective date), never blank and never asked",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread, reply } = await terminate(t, "terminate Orla Penhallow effective immediately");
      expect(thread.proposal?.templateKey, reply.content).toBe("resignation-exit");
      today(thread, reply.content);
      expect(reply.content, "the effective date was asked for again").not.toMatch(/what (?:date|day)|which (?:date|day)|effective date\?/i);
    },
  },
  {
    id: "nov24-termination-effective-immediately-not-a-no-show-date",
    title: "\"terminate Orla Penhallow effective immediately for 3 no call no shows on 11/20, 11/21 and 11/22\", the model passing 11/22 as the effective date: dated today, never a no-show date",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread, reply } = await terminate(t, "terminate Orla Penhallow effective immediately for 3 no call no shows on 11/20, 11/21 and 11/22", "11/22");
      today(thread, reply.content);
    },
  },
  {
    id: "nov24-termination-effective-immediately-not-the-last-day",
    title: "\"terminate Orla Penhallow effective immediately, her last day worked was 11/21\": dated today; the last day worked is its own line, never the form's date",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread, reply } = await terminate(t, "terminate Orla Penhallow effective immediately, her last day worked was 11/21");
      today(thread, reply.content);
    },
  },
  {
    id: "nov24-termination-stated-effective-date-kept",
    title: "Control: \"terminate Orla Penhallow, effective 11/20\" (a stated effective date) keeps 11/20",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread, reply } = await terminate(t, "terminate Orla Penhallow, effective 11/20", "11/20");
      expect(thread.proposal?.formDate ?? null, reply.content).toBe("2026-11-20");
    },
  },
];
