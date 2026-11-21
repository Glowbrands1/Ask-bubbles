import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
import { lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE PERSON TOLD IS NAMED ACROSS TWO TURNS (port from the sibling app: its QA live retest, 20 Nov 2026)
 * ============================================================================
 *
 * The sibling app's production, masked:
 *  T1 "<A>'s shift lead, <L>, told her to clock out early and she refused" → a restatement and one question.
 *  T2 "a corrective action" → "…Observation of Offense: <A>'s shift lead, <L>, told her to clock out early and she
 *     refused."; the card's issue "Her shift lead, <L>, told her to clock out early and she refused."
 * <L> was named in T1 and is not on the roster: on T2 no other name was known, and the guard read "<A>'s shift lead" as
 * <A> telling. General rule: the teller is the subject before the verb, known or not, and a possessive never tells; the
 * card's own account is named the same way (QA's second live sample: the card's issue "She was late on 11/19.").
 * Invented people only: Fenna Prewitt (`loop-roster.ts`) and Corwin Ashdale, the lead (nobody on the roster).
 */

const REPORT = "The sibling app's QA live retest (20 Nov 2026), ported: T2's Observation and the card kept \"told her … she refused\"";
const T1 = "Fenna Prewitt's shift lead, Corwin Ashdale, told her to clock out early and she refused";
const T2 = "a corrective action";
const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").length;

/** The live model's two turns: T1 a restatement and one question, T2 the card with the live account. */
const live = () =>
  loopStandIn((view): LoopDecision => {
    if (users(view) === 1) return { text: "This is an account of Fenna refusing to clock out early. Do you want a Corrective Action or a Coaching Form for Fenna?" };
    if (!lastResult(view, "propose_form")) return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_FENNA.id, what_happened: "Her shift lead, Corwin Ashdale, told her to clock out early and she refused.", incident_date: "2026-11-20" } };
    return { text: "Here's the Corrective Action Form for **Fenna**.\n\n**Observation of Offense:** Fenna's shift lead, Corwin Ashdale, told her to clock out early and she refused." };
  });

const fixed = (id: string, title: string, run: (t: ReplayContext) => Promise<void>): ReplayCase => ({
  id,
  title,
  report: REPORT,
  status: "fixed",
  async run(t) {
    vi.setSystemTime(new Date("2026-11-20T15:00:00Z"));
    t.directory([...LOOP_STAFF]);
    t.as("location_manager", WEST_DODGE);
    await run(t);
  },
});

export const NOV21_AGENT_LOOP_PERSON_TOLD_TWO_TURNS_CASES: ReplayCase[] = [
  fixed("nov21-agent-loop-person-told-two-turns-reply", "T1 \"Fenna Prewitt's shift lead, Corwin Ashdale, told her to clock out early and she refused\", T2 \"a corrective action\": the reply's Observation line names Fenna (\"told Fenna to clock out early and Fenna refused\")", async (t) => {
    t.loopModel!(live());
    const thread = t.thread();
    await thread.say(T1);
    const reply = await thread.say(T2);
    expect(reply.content, `the reply kept a pronoun for the card's person:\n${reply.content}`).toContain("told Fenna to clock out early and Fenna refused");
    expect(reply.content).not.toMatch(/\btold her\b|\bshe refused\b/);
  }),
  fixed("nov21-agent-loop-person-told-two-turns-card", "The same two turns: the card's own account names Fenna (\"Fenna's shift lead, Corwin Ashdale, told Fenna to clock out early and Fenna refused.\"), never her/she", async (t) => {
    t.loopModel!(live());
    const thread = t.thread();
    await thread.say(T1);
    await thread.say(T2);
    const issue = (thread.proposal as { issue?: string } | null)?.issue ?? "";
    expect(issue, `the card's account kept a pronoun:\n${issue}`).toBe("Fenna's shift lead, Corwin Ashdale, told Fenna to clock out early and Fenna refused.");
  }),
  fixed("nov21-agent-loop-person-told-two-turns-t1-rule", "T1 (a story with no ask): the rules book says the one line is in the app's own words with the person's first name, never the manager's text typed back or a pronoun", async (t) => {
    const model = live();
    t.loopModel!(model);
    await t.thread().say(T1);
    expect(model.views[0]!.system).toMatch(/never the manager's text typed back and never a pronoun for the person/);
  }),
  fixed("nov21-agent-loop-card-issue-names-person-late", "QA's live sample \"my manager wants a CA for Fenna Prewitt, late on 11/19\": the card's own account reads \"Fenna was late on 11/19.\", never \"She was late on 11/19.\"", async (t) => {
    const model = loopStandIn((view): LoopDecision =>
      lastResult(view, "propose_form")
        ? { text: "Here's the Corrective Action Form for **Fenna**.\n\n**Observation of Offense:** Fenna was late on 11/19." }
        : { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_FENNA.id, what_happened: "She was late on 11/19.", incident_date: "2026-11-19" } },
    );
    t.loopModel!(model);
    const thread = t.thread();
    await thread.say("my manager wants a CA for Fenna Prewitt, late on 11/19");
    expect((thread.proposal as { issue?: string } | null)?.issue ?? "", "the card's account kept a pronoun").toBe("Fenna was late on 11/19.");
  }),
];
