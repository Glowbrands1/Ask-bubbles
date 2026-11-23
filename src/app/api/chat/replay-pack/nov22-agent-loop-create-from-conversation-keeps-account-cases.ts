import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { U35_TURNS } from "./nov22-agent-loop-u35a-did-you-mean-once-cases";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * "CREATE A CA FROM THIS CONVERSATION" KEEPS THE CARD'S ACCOUNT (Pau's round 3, U35 run a, 22 Nov 2026)
 * ============================================================================
 *
 * The tester's chat word for word (production 1c71e11, admin login, agent loop on; the person invented: Liesl Moreno
 * Vargas, Grand Island). T10 "can i review the card" showed the card with "**Observation of Offense:** Liesl Vargas received
 * a customer complaint." T11 "Create a Corrective Action Form from this conversation." came back with the Observation gone
 * and "What happened with the customer complaint?"; T12 gave it again. The model re-proposed the card on screen without
 * what_happened; the model's history shows a card reply's lines only as "[card shown under this reply: …]", and the
 * account is read from the request's own words, so "from this conversation" carried none. Mechanism: with this person's
 * card of this form on screen, made with an account, a propose_form with no account goes back once to pass the manager's
 * account from the earlier turns. The tester's control (no account ever given) still asks what happened.
 */

const REPORT = "Pau's round 3 (22 Nov 2026, U35 run a): T11 \"Create a Corrective Action Form from this conversation.\" wiped the card's Observation and asked \"What happened with the customer complaint?\"";
const LIESL: DirectoryRow = { id: "e-liesl-moreno-vargas", firstName: "Liesl", lastName: "Moreno Vargas", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-236"], positionName: "Team Member Part Time" };
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const T11 = U35_TURNS[10];
const ACCOUNT = "Liesl received a customer complaint.";

const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
const back = (view: LoopView, text: string) => {
  const asks = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0);
  return asks.length - 1 - asks.map((turn) => turn.text).lastIndexOf(text);
};

/**
 * The live model: the card from T2 on, with the account the manager gave at T2; at T11 it re-proposes the card on screen
 * with no account (as live). Handed the card_account_missing note, it passes the T2 account (`follows`).
 */
const live = (follows: boolean) =>
  loopStandIn((view): LoopDecision => {
    const message = said(view);
    const result = lastResult(view, "propose_form") as { card?: unknown; reason_code?: string; ask_exactly?: string } | null;
    if (result?.card || (result && result.reason_code !== "card_account_missing")) return { text: result.card ? "Here's the Corrective Action Form for **Liesl Moreno Vargas**." : (result.ask_exactly ?? "ok") };
    if (message === U35_TURNS[0]) return { text: "I couldn't find that in the company knowledge base." };
    const person = { template_key: "dpoa", employee_id: LIESL.id, person_evidence: evidenceFrom(view, "Liesl Moreno Vargas", back(view, U35_TURNS[8])) };
    const account = { what_happened: ACCOUNT };
    if (message === T11 && !(result?.reason_code === "card_account_missing" && follows)) return { tool: "propose_form", input: person };
    return { tool: "propose_form", input: { ...person, ...account } };
  });

const issueOf = (proposal: unknown) => (proposal as { issue?: string | null } | null)?.issue ?? "";

export const NOV22_AGENT_LOOP_CREATE_FROM_CONVERSATION_KEEPS_ACCOUNT_CASES: ReplayCase[] = [
  {
    id: "nov22-r3-create-from-conversation-keeps-account",
    title: "Round 3 U35(a): T11 \"Create a Corrective Action Form from this conversation.\" with Liesl's card on screen (Observation \"… received a customer complaint\"): the card keeps its Observation and never asks what happened again",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T16:00:00Z"));
      t.directory([...LOOP_STAFF, LIESL]);
      t.as("admin", ADMIN);
      t.loopModel!(live(true));
      const thread = t.thread();
      /* T9 "okay the correct way is Liesl Moreno Vargas" names her as the staff list has her; T10 shows the card. */
      for (const turn of [U35_TURNS[0], U35_TURNS[1], U35_TURNS[8], U35_TURNS[9]]) await thread.say(turn);
      expect(issueOf(thread.proposal), "T10's card has no account (the case proves nothing)").toMatch(/customer complaint/);
      const reply = await thread.say(T11);
      expect(thread.proposal?.employeeName, reply.content).toBe("Liesl Moreno Vargas");
      expect(issueOf(thread.proposal), `T11 wiped the card's Observation:\n${reply.content}`).toMatch(/customer complaint/);
      expect(reply.content, "T11 asked what happened again").not.toMatch(/what happened/i);
    },
  },
  {
    id: "nov22-r3-create-from-conversation-no-account-still-asks",
    title: "Control (the tester's run ii): with no account given anywhere, \"Create a Corrective Action Form from this conversation.\" makes the card with no Observation, never an invented one",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T16:00:00Z"));
      t.directory([...LOOP_STAFF, LIESL]);
      t.as("admin", ADMIN);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as { card?: unknown; reason_code?: string } | null;
        if (result) return { text: result.card ? "Here's the Corrective Action Form for **Liesl Moreno Vargas**. What happened?" : `refused: ${result.reason_code}` };
        return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LIESL.id, person_evidence: evidenceFrom(view, "Liesl Moreno Vargas", back(view, U35_TURNS[8])) } };
      }));
      const thread = t.thread();
      await thread.say(U35_TURNS[8]);
      await thread.say(T11);
      expect(thread.proposal?.employeeName).toBe("Liesl Moreno Vargas");
      expect(issueOf(thread.proposal), "an Observation nobody gave").toBe("");
    },
  },
];

/*
 * Pau's round 3, U21 T7 (the tester's chat word for word; invented: Briony Kask, West Dodge): T6's card held "Coaching —
 * 09/22/2026 …; JBA Woven policies acknowledged on 5/26/26"; T7 "add the direct policy from the official manual that goes
 * with this" re-proposed with the policy and no prior_actions, and the card's prior actions were wiped. QA: the same
 * mechanism as the account, for prior actions; a manager removing a step still removes it.
 */
const BRIONY: DirectoryRow = { id: "e-briony-kask", firstName: "Briony", lastName: "Kask", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const U21 = [
  "corrective action",
  "briony kask",
  "This is what happened: She has recieved coaching on 9/22 for cleaning tasks not being completed. What was observed this weekend is that trash liners were not put into the trash cans after collecting trash, laundry was not done",
  "jba woven policys were acknowledged on 5/26/26",
  "payroll is not deductable",
  "verbal warning",
  "add the direct policy from the official manual that goes with this",
] as const;
const U21_ACCOUNT = "Briony was observed this weekend not putting trash liners into the trash cans after collecting trash, and laundry was not done.";
const U21_PRIOR = "Coaching — 09/22/2026 (cleaning tasks not being completed); JBA Woven policies acknowledged — 05/26/2026";
const REMOVE = "take the coaching from 9/22 off the prior actions";
const U21_REPORT = "Pau's round 3 (22 Nov 2026, U21 T7): \"add the direct policy from the official manual that goes with this\" wiped the card's prior actions";

/** The live model through T6, every fact each turn; at T7 (or `REMOVE`) it re-proposes with `last` (as live: no prior_actions at T7). */
const u21Model = (last: Record<string, unknown>, follows: boolean) =>
  loopStandIn((view): LoopDecision => {
    const message = said(view);
    const result = lastResult(view, "propose_form") as { card?: { prior_actions?: string | null; policy?: string | null }; reason_code?: string } | null;
    if (message === U21[0]) return { text: "Who is this Corrective Action Form for, and what happened?" };
    if (result?.card) return { text: `Here's the Corrective Action Form for **Briony Kask**.\n\n**Policy:** ${result.card.policy ?? ""}` };
    if (result && result.reason_code !== "card_prior_actions_missing") return { text: `refused: ${result.reason_code}` };
    const seen = (text: string) => view.turns.some((turn) => turn.role === "user" && turn.text === text);
    const base = {
      template_key: "dpoa", employee_id: BRIONY.id, person_evidence: evidenceFrom(view, "briony kask", back(view, U21[1])),
      policy: headingWith(view, /standards of conduct/i),
      ...(message === U21[1] ? {} : { what_happened: U21_ACCOUNT }),
      ...(seen(U21[4]) ? { payroll_deduct: "no", payroll_evidence: evidenceFrom(view, U21[4], back(view, U21[4])) } : {}),
      ...(seen(U21[5]) ? { warning_level: "verbal", level_evidence: evidenceFrom(view, U21[5], back(view, U21[5])) } : {}),
    };
    if (message === U21[6] || message === REMOVE) {
      if (result?.reason_code === "card_prior_actions_missing" && follows) return { tool: "propose_form", input: { ...base, ...last, prior_actions: U21_PRIOR } };
      return { tool: "propose_form", input: { ...base, ...last } };
    }
    return { tool: "propose_form", input: { ...base, ...(seen(U21[3]) ? { prior_actions: U21_PRIOR } : {}) } };
  });

async function u21Chat(t: ReplayContext, last: Record<string, unknown>, final: string) {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, BRIONY]);
  t.as("location_manager", WEST_DODGE);
  const model = u21Model(last, true);
  t.loopModel!(model);
  const thread = t.thread();
  for (const turn of U21.slice(0, 6)) await thread.say(turn);
  const priorOf = () => ((model.views.flatMap((view) => view.results.filter((result) => result.tool === "propose_form")).at(-1)?.output as { card?: { prior_actions?: string | null } } | undefined)?.card?.prior_actions ?? "");
  expect(priorOf(), "T6's card holds no prior actions (the case proves nothing)").toMatch(/09\/22/);
  const reply = await thread.say(final);
  return { reply, prior: priorOf() };
}

export const NOV22_AGENT_LOOP_CARD_KEEPS_PRIOR_ACTIONS_CASES: ReplayCase[] = [
  {
    id: "nov22-r3-u21-t7-policy-change-keeps-prior-actions",
    title: "Round 3 U21 T7: \"add the direct policy from the official manual that goes with this\", re-proposed with the policy and no prior_actions (as live): the card keeps \"Coaching — 09/22/2026 …; JBA Woven policies acknowledged …\"",
    report: U21_REPORT,
    status: "fixed",
    async run(t) {
      const { reply, prior } = await u21Chat(t, {}, U21[6]);
      expect(prior, `T7 wiped the prior actions:\n${reply.content}`).toMatch(/09\/22\/2026/);
      expect(prior, `T7 wiped the prior actions:\n${reply.content}`).toMatch(/05\/26\/2026/);
    },
  },
  {
    id: "nov22-r3-u21-removing-a-prior-step-removes-it",
    title: "Control (QA): the manager taking one prior step off (\"take the coaching from 9/22 off the prior actions\") is a call with the steps left, kept as passed: 9/22 is gone, 5/26 stays",
    report: U21_REPORT,
    status: "fixed",
    async run(t) {
      const { reply, prior } = await u21Chat(t, { prior_actions: "JBA Woven policies acknowledged — 05/26/2026" }, REMOVE);
      expect(prior, reply.content).not.toMatch(/09\/22/);
      expect(prior, reply.content).toMatch(/05\/26\/2026/);
    },
  },
];
