import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * THE EXIT TYPE IS THE ONE THE MANAGER NAMED (QA's Bubbles round 2, 22 Nov 2026, U24, HIGH)
 * ============================================================================
 *
 * The manager typed "Immediate Vol Resignation … resigned via phone call" (QA's quote; the person invented): the card
 * said "Filed as: No Call No Show" and the saved resignation_type was no_call_no_show — the model's exit_how quoting
 * "resigned via phone call". exit_how is now kept only when its quoted words name the option's own label on the form
 * (at least half its words, exactly, by a prefix like "Vol", or a close spelling): template data, no word list.
 */

const REPORT = "QA's Bubbles round 2 (22 Nov 2026, U24): \"Immediate Vol Resignation … resigned via phone call\" was filed and saved as No Call No Show";
const SAID = "exit form for Thaddea Kroll. Immediate Vol Resignation, she resigned via phone call on 11/18";

type Out = { facts?: { exit_ticks?: string[] } } | null;

async function run(t: ReplayContext, how: string, quote: string, said = SAID) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
  t.loopModel!(loopStandIn((view): LoopDecision => {
    const result = lastResult(view, "propose_form") as Out;
    if (result) return { text: `Here's the Resignation/Exit Form for **Thaddea**. Filed as: ${(result.facts?.exit_ticks ?? []).join(", ") || "nothing yet"}.` };
    return {
      tool: "propose_form",
      input: {
        template_key: "resignation-exit", employee_id: LOOP_THADDEA.id, exit_type: "resignation",
        exit_evidence: { ...evidenceFrom(view, "exit form for Thaddea Kroll"), kind: "asks_for_exit_form" },
        what_happened: "Thaddea resigned via phone call on 11/18.",
        exit_how: how, exit_how_evidence: evidenceFrom(view, quote),
      },
    };
  }));
  const thread = t.thread();
  const reply = await thread.say(said);
  const id = await thread.create();
  return { reply, checked: t.checked(id) };
}

export const NOV22_AGENT_LOOP_EXIT_HOW_NAMES_ITS_OPTION_CASES: ReplayCase[] = [
  {
    id: "nov22-r2-u24-phone-call-never-no-call-no-show",
    title: "U24: \"Immediate Vol Resignation … resigned via phone call\" with the model's exit_how no_call_no_show on \"resigned via phone call\": No Call No Show is never filed or saved",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { reply, checked } = await run(t, "no_call_no_show", "resigned via phone call");
      expect(reply.content, `the card files No Call No Show:\n${reply.content}`).not.toMatch(/No Call No Show/i);
      expect(checked.resignation_type ?? [], JSON.stringify(checked)).not.toContain("no_call_no_show");
    },
  },
  {
    id: "nov22-r2-u24-vol-resignation-is-immediate-voluntary",
    title: "U24: the same words with exit_how immediate_voluntary_resignation on \"Immediate Vol Resignation\": Immediate Voluntary Resignation is filed and saved",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { checked } = await run(t, "immediate_voluntary_resignation", "Immediate Vol Resignation");
      expect(checked.resignation_type ?? [], JSON.stringify(checked)).toEqual(["immediate_voluntary_resignation"]);
    },
  },
  {
    id: "nov22-r2-u24-notice-fulfilling-never-did-not-fulfill",
    title: "U24, ported control (QA, 22 Nov 2026, from the sibling app's #1215): \"she gave 2 weeks notice and is fulfilling them\" with the model's exit_how notice_not_fulfilled on those words — \"notice\" never names the label's \"not\", so Did not fulfill is never filed or saved",
    report: "QA, 22 Nov 2026: quoteNamesOption read \"notice\" as naming \"not\", so \"gave 2 weeks notice and is fulfilling them\" named \"Did not fulfill required 14 day / 30 day notice\"",
    status: "fixed",
    async run(t) {
      const said = "exit form for Thaddea Kroll. Her last day is nov 23 she is returning her key she gave 2 weeks notice and is fulfilling them";
      const { reply, checked } = await run(t, "notice_not_fulfilled", "she gave 2 weeks notice and is fulfilling them", said);
      expect(reply.content, `the card files Did not fulfill:\n${reply.content}`).not.toMatch(/Did not fulfill/i);
      expect(checked.resignation_type ?? [], JSON.stringify(checked)).not.toContain("notice_not_fulfilled");
    },
  },
];
