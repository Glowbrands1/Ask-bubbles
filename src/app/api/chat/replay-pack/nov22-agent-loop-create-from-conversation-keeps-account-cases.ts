import { expect, vi } from "vitest";

import { type DirectoryRow, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { U35_TURNS } from "./nov22-agent-loop-u35a-did-you-mean-once-cases";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

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
