import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { ACCOUNT, T1 as T1_KROL, T2, T3, T4 } from "./nov21-agent-loop-corrected-name-everywhere-cases";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A CORRECTED SPELLING OF THE CARD'S OWN PERSON IS THAT PERSON (QA's Bubbles live re-run, 22 Nov 2026, A1, BLOCKER)
 * ============================================================================
 *
 * The manager's turns, word for word (the person invented; T1–T4 as in `nov21-agent-loop-corrected-name-everywhere`):
 * T1 names "<P1>" (a misspelling, not on the staff list) and asks for a CA; T2's card is <P1>'s; T3 "Create the coaching
 * form with the information given. Her name is <P2> and she is at Dodge. …" corrects the spelling to the staff list's
 * <P2>. Live (CARD_PERSON_THIS_REQUEST on): propose_form was refused twice as person_change_not_asked, the turn ran out
 * of time at T4 with no reply stored, and Create on the old card was refused 409. Pau's rule: a name correction is the
 * manager's own words. Mechanism: a person whose name this message gives, and who is a close spelling of the open card's
 * person (one name the same, the other within two letters), is that card's person, corrected.
 */

const REPORT = "QA's Bubbles live re-run (22 Nov 2026, A1): \"Her name is <P2>\" (the corrected spelling of the card's <P1>) was refused as person_change_not_asked twice; T4 timed out with no reply stored; Create got 409";
/** The misspelling as live: far enough from the staff list that the card kept it as typed (off the list). */
const P1 = "Tadea Krohl";
const T1 = T1_KROL.replace("Thaddea Krol", P1);
const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").length;

/** T1/T2 the CA card for the misspelling as typed; from T3 the live model proposes the Coaching form for the corrected name. */
const live = (byId: boolean) =>
  loopStandIn((view): LoopDecision => {
    const turn = users(view);
    const proposed = lastResult(view, "propose_form") as { card?: unknown; reason_code?: string } | null;
    if (proposed?.card) return { text: turn >= 3 ? "Here is the Coaching Form for **Thaddea**." : "Here is the Corrective Action Form." };
    if (proposed?.reason_code) return { text: `refused: ${proposed.reason_code}` };
    if (turn <= 2) return { tool: "propose_form", input: { template_key: "dpoa", employee_name: P1, what_happened: ACCOUNT.replace("Thaddea Krol", P1), incident_date: "2026-10-15", person_evidence: evidenceFrom(view, P1, turn - 1) } };
    const who = byId ? { employee_id: LOOP_THADDEA.id } : { employee_name: "Thaddea Kroll" };
    return { tool: "propose_form", input: { template_key: "coaching", ...who, what_happened: ACCOUNT, incident_date: "2026-10-15", person_evidence: evidenceFrom(view, "Thaddea Kroll", turn === 3 ? 0 : 1) } };
  });

const run = (byId: boolean) => async (t: ReplayContext) => {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
  const model = live(byId);
  t.loopModel!(model);
  const thread = t.thread();
  await thread.say(T1);
  await thread.say(T2);
  /*
   * CHANGED ON PURPOSE (QA's Bubbles round 2, 22 Nov 2026; Pau's rule: "a staff match is taken only if the manager's own
   * words contain that exact name, or the manager confirmed it through 'Did you mean <name>?'"): the misspelling is a close
   * spelling of the staff list's person, so T1 and T2 now get "Did you mean …?" and no card is kept for the misspelling.
   * The live chat reached T3 with such a card only because TYPED_NAME kept the close match as typed. The correction
   * mechanism (`closeSpellingOfName`) stays for a name kept as typed on the manager's say-so.
   */
  expect(thread.proposal?.employeeName ?? null, "a card was kept for the close misspelling").not.toBe(P1);
  const t3 = await thread.say(T3);
  const refusals = model.views.flatMap((view) => view.results.filter((result) => result.tool === "propose_form").map((result) => (result.output as { reason_code?: string }).reason_code)).filter(Boolean);
  expect(refusals, `the corrected spelling was refused:\n${t3.content}`).not.toContain("person_change_not_asked");
  expect(thread.proposal?.templateKey, t3.content).toBe("coaching");
  expect(thread.proposal?.employeeName, "the card is not the corrected person's").toBe("Thaddea Kroll");
  await thread.say(T4);
  const id = await thread.create();
  expect(t.forms().find((row) => row.id === id)?.employee_name, "Create did not save the corrected person's form").toBe("Thaddea Kroll");
};

export const NOV22_AGENT_LOOP_NAME_CORRECTION_SAME_PERSON_CASES: ReplayCase[] = [
  { id: "nov22-a1-corrected-spelling-by-name-is-the-card-person", title: "A1: T3 \"… Her name is <P2> …\" with the model passing the corrected name: the Coaching card is <P2>'s (never person_change_not_asked), T4 keeps it, Create saves it", report: REPORT, status: "fixed", run: run(false) },
  { id: "nov22-a1-corrected-spelling-by-id-is-the-card-person", title: "A1: the same chat with the model passing <P2>'s staff id: the Coaching card is <P2>'s, T4 keeps it, Create saves it", report: REPORT, status: "fixed", run: run(true) },
];
