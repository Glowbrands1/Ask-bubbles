import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_OZREN, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A CARD'S PERSON IS NAMED BY THE MANAGER IN THIS REQUEST (CARD_PERSON_THIS_REQUEST_ENABLED; port from the sibling app)
 * ============================================================================
 *
 * The outside audit's wrong-person risk, approved by Pau (21 Nov 2026): the loop seated a roster person when ANY manager
 * turn in the chat held their name, or any earlier card was theirs, so a name from an earlier unrelated turn, or a card
 * made for someone the manager had since moved on from, could put a form on the wrong person (it happened in this app
 * on 18 Nov 2026). With the flag on, the person must be named in this request: the turn that asks, or a turn after the
 * chat's last card, after the last turn that named a different roster person, or after a who-is-this-for question.
 * Invented people from the loop roster (`loop-roster.ts`): Fenna Prewitt, Ozren Brack.
 *
 * The flag is off in production (`production-flags.json`), so the wrong-person cases are `open` there and pass with the
 * flag on; the f059 story-then-ask flow and the plain cases hold either way.
 */

const NEW_FLAG = "CARD_PERSON_THIS_REQUEST_ENABLED";
const REPORT = "QA2 (21 Nov 2026), the outside audit's wrong-person risk: a card's person accepted from any earlier turn or card in the chat";
const FENNA = LOOP_FENNA.id;
const OZREN = LOOP_OZREN.id;
const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").length;

function setup(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-20T15:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

/** A model that proposes a card for this person (by employee_id) whatever the manager's words, as a model carrying a name over would. */
const proposesFor = (employeeId: string, account: string) =>
  loopStandIn((view): LoopDecision =>
    lastResult(view, "propose_form")
      ? { text: "Here's the card." }
      : { tool: "propose_form", input: { template_key: "dpoa", employee_id: employeeId, what_happened: account, incident_date: "2026-11-19", person_evidence: evidenceFrom(view) } },
  );

const open = (id: string, title: string, run: (t: ReplayContext) => Promise<void>): ReplayCase => ({
  id,
  title,
  report: REPORT,
  // ON in production since 21 Nov 2026 13:31Z (QA2, Pau approved): these cases now hold with production's flags.
  status: "fixed",
  fixFlags: [NEW_FLAG],
  async run(t) {
    setup(t);
    await run(t);
  },
});

const fixed = (id: string, title: string, run: (t: ReplayContext) => Promise<void>): ReplayCase => ({
  id,
  title,
  report: REPORT,
  status: "fixed",
  fixFlags: [NEW_FLAG],
  async run(t) {
    setup(t);
    await run(t);
  },
});

export const NOV21_AGENT_LOOP_CARD_PERSON_THIS_REQUEST_CASES: ReplayCase[] = [
  open("nov21-card-person-different-person-two-turns-earlier", "Fenna Prewitt is named, then Ozren Brack, then \"make a ca, she was late on 11/19\": the model carries Fenna over; no card is made, the reply asks who the form is for", async (t) => {
    t.loopModel!(loopStandIn((view): LoopDecision => {
      if (users(view) < 3) return { text: "Okay." };
      return lastResult(view, "propose_form") ? { text: "Who is this Corrective Action Form for?" } : { tool: "propose_form", input: { template_key: "dpoa", employee_id: FENNA, what_happened: "She was late on 11/19.", incident_date: "2026-11-19" } };
    }));
    const thread = t.thread();
    await thread.say("fenna prewitt has been a great help this month");
    await thread.say("ozren brack opened the store today");
    await thread.say("make a ca, she was late on 11/19");
    expect(thread.proposal ?? null, "a card was made for a person named two turns before another").toBeNull();
  }),
  open("nov21-card-person-earlier-card-then-another-person", "A card for Fenna Prewitt, then a card for Ozren Brack, then \"make another ca, she left early on 11/19\": a card for Fenna is not made from the old card; Ozren, the latest, is still the person", async (t) => {
    let who = FENNA;
    t.loopModel!(loopStandIn((view): LoopDecision =>
      lastResult(view, "propose_form") ? { text: "Here's the card." } : { tool: "propose_form", input: { template_key: "dpoa", employee_id: who, what_happened: users(view) === 1 ? "Fenna Prewitt was late on 11/19." : users(view) === 2 ? "Ozren Brack was late on 11/18." : "She left early on 11/19.", incident_date: "2026-11-19" } },
    ));
    const thread = t.thread();
    await thread.say("ca for fenna prewitt, late on 11/19");
    who = OZREN;
    await thread.say("ca for ozren brack, late on 11/18");
    who = FENNA;
    const reply = await thread.say("make another ca, she left early on 11/19");
    expect(reply.formProposal?.employeeName ?? null, "an old card's person was carried onto the new card after someone else was named").not.toBe("Fenna Prewitt");
  }),
  fixed("nov21-card-person-f059-story-then-ask", "f059's flow still works: \"Fenna Prewitt was late on 11/19\" (a story, no ask), then \"a corrective action\": the card is Fenna's", async (t) => {
    t.loopModel!(loopStandIn((view): LoopDecision => {
      if (users(view) === 1) return { text: "This is an account of Fenna being late. Do you want a Corrective Action or a Coaching Form?" };
      return lastResult(view, "propose_form") ? { text: "Here's the card." } : { tool: "propose_form", input: { template_key: "dpoa", employee_id: FENNA, what_happened: "Fenna was late on 11/19.", incident_date: "2026-11-19" } };
    }));
    const thread = t.thread();
    await thread.say("Fenna Prewitt was late on 11/19");
    await thread.say("a corrective action");
    expect(thread.proposal?.employeeName, "the person named in the story was not carded").toBe("Fenna Prewitt");
  }),
  fixed("nov21-card-person-this-turn-names-them", "\"ca for fenna prewitt, late on 11/19\" (the turn that asks names the person) makes Fenna's card, flag on or off", async (t) => {
    t.loopModel!(proposesFor(FENNA, "Fenna was late on 11/19."));
    const thread = t.thread();
    await thread.say("ca for fenna prewitt, late on 11/19");
    expect(thread.proposal?.employeeName).toBe("Fenna Prewitt");
  }),
  fixed("nov21-card-person-name-only-in-the-reply", "A name only in the app's reply (\"Fenna Prewitt and Ozren Brack work Saturday\"), then \"make a ca, she was late on 11/19\": no card is made for either", async (t) => {
    t.loopModel!(loopStandIn((view): LoopDecision => {
      if (users(view) === 1) return { text: "Fenna Prewitt and Ozren Brack work Saturday." };
      return lastResult(view, "propose_form") ? { text: "Who is this Corrective Action Form for?" } : { tool: "propose_form", input: { template_key: "dpoa", employee_id: FENNA, what_happened: "She was late on 11/19.", incident_date: "2026-11-19" } };
    }));
    const thread = t.thread();
    await thread.say("who works saturday?");
    await thread.say("make a ca, she was late on 11/19");
    expect(thread.proposal ?? null, "a card was made for a name only the app wrote").toBeNull();
  }),
  open("nov21-card-person-exit-account-names-the-store-manager", "QA2's 17 Nov case (this app's old path, conv_mwk2t40v27izanu): \"create an exit for Fenna Prewitt\", the details, then an account naming \"Store Manager, Ozren Brack, messaged Fenna …\": the exit card stays Fenna's; the model's second card for Ozren is refused", async (t) => {
    t.loopModel!(loopStandIn((view): LoopDecision => {
      const exit = (employeeId: string) => ({ tool: "propose_form" as const, input: { template_key: "resignation-exit", employee_id: employeeId, exit_type: "resignation", exit_evidence: { ...evidenceFrom(view), kind: "asks_for_exit_form" } } });
      if (users(view) === 2) return { text: "Got it." };
      if (lastResult(view, "propose_form")) return { text: "Here's the Resignation/Exit Form." };
      return users(view) === 1 ? exit(FENNA) : exit(OZREN);
    }));
    const thread = t.thread();
    await thread.say("create an exit for Fenna Prewitt");
    expect(thread.proposal?.employeeName, "the first card is Fenna's").toBe("Fenna Prewitt");
    await thread.say("last day worked 11-10-26. Fenna quit without notice. payroll deduct applies");
    const reply = await thread.say("On 11-14-26 Store Manager, Ozren Brack, messaged Fenna asking if she forgot to clock in or come to work on 11-13-26. Fenna replied stating, \"I didn't come in, I'm actually going to resign. I meant to call in but I been dealing with my sick baby.\"");
    expect(reply.formProposal?.employeeName ?? null, "the exit card moved to the store manager named inside the account").not.toBe("Ozren Brack");
  }),
];
