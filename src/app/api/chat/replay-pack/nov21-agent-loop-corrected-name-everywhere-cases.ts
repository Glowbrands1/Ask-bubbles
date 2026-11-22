import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A NAME CORRECTED MID-CHAT IS THE NAME EVERYWHERE (QA's live re-test, 21 Nov 2026, Pau's account, loop on)
 * ============================================================================
 *
 * QA's conversation, in their words (the person invented: Thaddea Kroll, `loop-roster.ts`, first typed "Thaddea Krol"):
 *  T1 "My employee <First> <Lastx> has was 10 minutes late on her last two shifts. … She was late on 10/5 and 10/15"
 *  T2 "I already told you the employee name. She is at Dodge"
 *  T3 "Create the coaching form with the information given. Her name is <First> <Lasty> and she is at Dodge. She is a
 *     makery associate"
 *  T4 "she is at Omaha dodge"
 * The card's employee became the corrected spelling, but its account (and the saved Coaching Details) still said
 * "<First> <Lastx>", copied from T1. Expected: the corrected name replaces the old spelling everywhere; the old spelling
 * appears nowhere on the card or the saved form.
 */

export const REPORT = "QA's live re-test (21 Nov 2026, Pau's account, agent loop on): the name corrected mid-chat kept the old spelling in the account and the saved write-up";
export const T1 = "My employee Thaddea Krol has was 10 minutes late on her last two shifts. On the first shift I verbally coached her on our policy and expectations. Then she was late again. Please create a CA form so I can document. She was late on 10/5 and 10/15";
export const T2 = "I already told you the employee name. She is at Dodge";
export const T3 = "Create the coaching form with the information given. Her name is Thaddea Kroll and she is at Dodge. She is a makery associate";
export const T4 = "she is at Omaha dodge";
/** The live model's account: the manager's T1, the misspelt name and all. */
export const ACCOUNT = "Thaddea Krol was 10 minutes late on her last two shifts. On the first shift she was verbally coached on policy and expectations. Then she was late again on 10/15.";
/** The old spelling, never the corrected one ("Kroll" holds "Krol"). */
/*
 * QA's Bubbles round 2 (22 Nov 2026), near-miss names: T1's "Thaddea Krol" is a close spelling of the staff list's
 * Thaddea Kroll, so T1 and T2 now get "Did you mean …?" (Pau's rule) instead of a card kept as typed; T3's card is the
 * first card. The assertions are unchanged: no card, reply or saved field keeps the old spelling. The saved write-up's
 * spelling is corrected at Create (the draft route's staff-spelling step).
 */
export const OLD_SPELLING = /\bKrol(?!l)/i;

const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").length;

/** T1/T2 a Corrective Action card, T3 the Coaching card the manager asked for, the account as the live model copied it. */
const live = () =>
  loopStandIn((view): LoopDecision => {
    const turn = users(view);
    if (lastResult(view, "propose_form")) return { text: turn >= 3 ? "Here is the Coaching Form for **Thaddea**." : "Here is the Corrective Action Form." };
    if (turn <= 2) return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Thaddea Krol", what_happened: ACCOUNT, incident_date: "2026-10-15", person_evidence: evidenceFrom(view, "Thaddea Krol", turn - 1) } };
    return { tool: "propose_form", input: { template_key: "coaching", employee_id: LOOP_THADDEA.id, what_happened: ACCOUNT, incident_date: "2026-10-15", person_evidence: evidenceFrom(view, "Thaddea Kroll") } };
  });

const fixed = (id: string, title: string, run: (t: ReplayContext) => Promise<void>): ReplayCase => ({
  id,
  title,
  report: REPORT,
  status: "fixed",
  async run(t) {
    vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
    t.directory([...LOOP_STAFF]);
    t.as("location_manager", WEST_DODGE);
    t.loopModel!(live());
    await run(t);
  },
});

export const NOV21_AGENT_LOOP_CORRECTED_NAME_EVERYWHERE_CASES: ReplayCase[] = [
  fixed("nov21-agent-loop-corrected-name-card-account", "T1 \"My employee Thaddea Krol has was 10 minutes late …\", T3 \"… Her name is Thaddea Kroll …\": the card is Thaddea Kroll's and its account never says \"Thaddea Krol\"", async (t) => {
    const thread = t.thread();
    for (const said of [T1, T2, T3]) await thread.say(said);
    const card = thread.proposal as { employeeName?: string; templateKey?: string; issue?: string } | null;
    expect(card?.employeeName).toBe("Thaddea Kroll");
    expect(card?.templateKey).toBe("coaching");
    expect(card?.issue ?? "", "the card's account kept the old spelling").not.toMatch(OLD_SPELLING);
    expect(card?.issue ?? "").toMatch(/10 minutes late/);
  }),
  fixed("nov21-agent-loop-corrected-name-saved-write-up", "The same chat through T4 \"she is at Omaha dodge\" and Create (the loop card's account is the saved Observed): the saved Coaching Details never say \"Thaddea Krol\"", async (t) => {
    const thread = t.thread();
    for (const said of [T1, T2, T3, T4]) await thread.say(said);
    const id = await thread.create();
    const values = t.values(id);
    expect(values.employee_name).toBe("Thaddea Kroll");
    for (const [field, value] of Object.entries(values)) expect(value, `${field} kept the old spelling`).not.toMatch(OLD_SPELLING);
    expect(values.coaching_details ?? "").toMatch(/10 minutes late/);
  }),
];
