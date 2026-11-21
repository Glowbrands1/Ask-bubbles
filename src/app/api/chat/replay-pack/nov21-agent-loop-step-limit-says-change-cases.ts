import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { ACCOUNT, T1, T2, T3, T4 } from "./nov21-agent-loop-corrected-name-everywhere-cases";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A CARD MADE AT THE STEP LIMIT SAYS WHAT CHANGED, AND NEVER ASKS FOR IT AGAIN (QA's live re-test, 21 Nov 2026)
 * ============================================================================
 *
 * QA's conversation (`nov21-agent-loop-corrected-name-everywhere-cases.ts`, the person invented): after T3 "Create the
 * coaching form with the information given. Her name is <First> <Lasty> and she is at Dodge. She is a makery associate"
 * and T4 "she is at Omaha dodge", the reply was only "Here is the **Coaching Form** for **<name>** for you to review.
 * Nothing else was saved yet. Please send the change you still need again, and I'll make it." The card had applied the
 * name and the form switch, but the reply never said so and asked the manager to repeat it. The live model kept calling
 * propose_form until the turn's step limit; the reply is then the app's own (`stepLimitReply`). Expected: it says plainly
 * what changed (Corrective Action → Coaching, the name, the store) and never asks to send the change again.
 */

const REPORT = "QA's live re-test (21 Nov 2026, Pau's account, agent loop on): \"Please send the change you still need again\" after the card applied it";
const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").length;
const ASKS_AGAIN = /send (?:the|that|it|anything)[^.]*again|still need again/i;

/** T1/T2 a Corrective Action card; T3 and T4 the Coaching card proposed again and again, as live, until the step limit. */
const live = () =>
  loopStandIn((view): LoopDecision => {
    const turn = users(view);
    if (turn <= 2) {
      if (lastResult(view, "propose_form")) return { text: "Here is the Corrective Action Form." };
      return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Thaddea Krol", what_happened: ACCOUNT, incident_date: "2026-10-15", person_evidence: evidenceFrom(view, "Thaddea Krol", turn - 1) } };
    }
    return { tool: "propose_form", input: { template_key: "coaching", employee_id: LOOP_THADDEA.id, what_happened: ACCOUNT, incident_date: "2026-10-15", person_evidence: evidenceFrom(view, "Thaddea Kroll", turn - 3) } };
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

export const NOV21_AGENT_LOOP_STEP_LIMIT_SAYS_CHANGE_CASES: ReplayCase[] = [
  fixed("nov21-agent-loop-step-limit-says-form-switch", "T3 \"Create the coaching form with the information given. Her name is Thaddea Kroll …\" at the step limit: the reply says the form changed from the Corrective Action Form to the Coaching Form, for Thaddea Kroll at the West Dodge store, and never asks to send the change again", async (t) => {
    const thread = t.thread();
    await thread.say(T1);
    await thread.say(T2);
    const reply = await thread.say(T3);
    expect(thread.proposal?.templateKey, "no Coaching card (the case proves nothing)").toBe("coaching");
    expect(reply.content, `the reply did not say what changed:\n${reply.content}`).toContain("I changed the form from the Corrective Action Form to the Coaching Form");
    expect(reply.content).toMatch(/The card is for Thaddea Kroll at Omaha, NE \(West Dodge Rd\)\./);
    expect(reply.content, `the reply asked for the change again:\n${reply.content}`).not.toMatch(ASKS_AGAIN);
  }),
  fixed("nov21-agent-loop-step-limit-says-store", "T4 \"she is at Omaha dodge\" at the step limit: the reply confirms the card's person and store, and never asks to send the change again", async (t) => {
    const thread = t.thread();
    for (const said of [T1, T2, T3]) await thread.say(said);
    const reply = await thread.say(T4);
    expect(reply.content, `the reply did not confirm the store:\n${reply.content}`).toMatch(/The card is for Thaddea Kroll at Omaha, NE \(West Dodge Rd\)\./);
    expect(reply.content, `the reply asked for the change again:\n${reply.content}`).not.toMatch(ASKS_AGAIN);
  }),
];
