import { expect, vi } from "vitest";

import { type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * TWO STAFF SHARE A FIRST NAME: THE WHICH-ONE QUESTION NEVER STALLS (the tester's A9, Pau's round-1 "Which Michelle")
 * ============================================================================
 *
 * An admin (global) asked "Create a coaching form." then "Rosalind" (two active Rosalinds, at two stores). The which-one
 * question was right, but the manager answered "yes", went on with the account, "yes, do that", "write the observtion":
 * the question came back five times over 8 turns, the full sentence each time, and no card. QA's ruling (b): the account
 * is held; the card is built the moment the person is named, by full name, surname or store (one of the people offered,
 * read from the server's record of the question, never a word list); a question asked again is short. Every person
 * invented (the tester's masked names).
 */

const REPORT = "The tester's A9 (round 1, admin/global): two staff share a first name; the which-one question came back five times and no card was built";
const HARTWELL: DirectoryRow = { id: "e-rosalind-hartwell", firstName: "Rosalind", lastName: "Hartwell", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Seasonal Team Member Part Time" };
const PIKE: DirectoryRow = { id: "e-rosalind-pike", firstName: "Rosalind", lastName: "Pike", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-67"], positionName: "Team Member Part Time" };
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const ACCOUNT = "rosalind marked an order as shipped but the customer hadn't picked up yet";

type Found = { matches?: Array<{ employee_id?: string }>; reason_code?: string; ask_exactly?: string; asked_before?: boolean; confirmed_by_manager?: unknown };
const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").length;
const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").at(-1)?.text ?? "";

/** The manager's account turn, quoted as the model would (its message id and its opening words). */
function accountEvidence(view: LoopView): { request_evidence?: Array<{ message_id: string; quote: string }> } {
  const turn = view.turns.find((entry) => entry.role === "user" && entry.text === ACCOUNT);
  const id = turn?.messageIds?.at(-1);
  return id ? { request_evidence: [{ message_id: id, quote: "rosalind marked an order as shipped" }] } : {};
}

/**
 * The model as the rules book has it: after "Create a coaching form." it asks who; then each turn it looks the person
 * up with the name the manager gave ("Rosalind", or the surname they answer with), says find_staff's question when there
 * is one, and proposes the card with the account the moment find_staff settles one person.
 */
function model(lookupName: (view: LoopView) => string) {
  return loopStandIn((view): LoopDecision => {
    if (users(view) === 1) return { text: "Who is this Coaching Form for?" };
    const proposed = lastResult(view, "propose_form");
    if (proposed) return { text: "Here's the Coaching Form." };
    const found = lastResult(view, "find_staff") as Found | null;
    if (!found) return { tool: "find_staff", input: { name: lookupName(view), person_evidence: evidenceFrom(view) } };
    const one = found.matches?.length === 1 ? found.matches[0]!.employee_id : null;
    if (one) return { tool: "propose_form", input: { template_key: "coaching", employee_id: one, person_evidence: evidenceFrom(view), what_happened: "Rosalind marked an order as shipped before the customer had picked it up.", ...accountEvidence(view) } };
    return { text: found.ask_exactly ?? "Which Rosalind is this for?" };
  });
}

async function chat(t: ReplayContext, turns: readonly string[], lookupName: (view: LoopView) => string) {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, HARTWELL, PIKE]);
  t.as("admin", ADMIN);
  const standIn = model(lookupName);
  t.loopModel!(standIn);
  const thread = t.thread();
  const replies: string[] = [];
  for (const turn of turns) replies.push((await thread.say(turn)).content);
  const lookups = standIn.views.flatMap((view) => view.results.filter((result) => result.tool === "find_staff").map((result) => ({ turn: users(view), out: result.output as Found })));
  return { thread, replies, lookups };
}

const fixed = (id: string, title: string, run: (t: ReplayContext) => Promise<void>): ReplayCase => ({ id, title, report: REPORT, status: "fixed", run });

export const NOV23_AGENT_LOOP_SAME_FIRST_NAME_NO_STALL_CASES: ReplayCase[] = [
  fixed("nov23-same-first-name-answer-by-surname-builds-card", "A9: \"Rosalind\" (two Rosalinds), the account, then \"Pike\": the card is built for Rosalind Pike at once, with the account held from the earlier turn", async (t) => {
    const { thread, lookups } = await chat(t, ["Create a coaching form.", "Rosalind", ACCOUNT, "Pike"], (view) => (said(view) === "Pike" ? "Pike" : "Rosalind"));
    expect(lookups.find((lookup) => lookup.turn === 2)?.out.reason_code, "the first lookup did not ask which (the case proves nothing)").toBe("ambiguous_person");
    expect(thread.proposal?.employeeName, `no card for Rosalind Pike after "Pike":\n${JSON.stringify(lookups.at(-1)?.out)}`).toBe("Rosalind Pike");
    expect(String((thread.proposal as { issue?: string } | null)?.issue ?? ""), "the account from the earlier turn is not on the card").toMatch(/shipped/);
  }),
  fixed("nov23-same-first-name-answer-by-store-builds-card", "A9: \"Rosalind\" (two Rosalinds, at West Dodge and Bellevue), the account, then \"the Bellevue one\": the card is built for Rosalind Pike", async (t) => {
    const { thread, lookups } = await chat(t, ["Create a coaching form.", "Rosalind", ACCOUNT, "the Bellevue one"], () => "Rosalind");
    expect(thread.proposal?.employeeName, `no card for Rosalind Pike after "the Bellevue one":\n${JSON.stringify(lookups.at(-1)?.out)}`).toBe("Rosalind Pike");
  }),
  fixed("nov23-same-first-name-ignored-question-short-not-guessed", "Control, A9's turns: \"yes\", the account and \"yes, do that\" name nobody: no card and no guess; each turn asks once, both people offered, and a question asked again is short", async (t) => {
    const { thread, lookups } = await chat(t, ["Create a coaching form.", "Rosalind", "yes", ACCOUNT, "yes, do that"], () => "Rosalind");
    expect(thread.proposal ?? null, "a card was built for a person the manager never named").toBeNull();
    const asks = lookups.map((lookup) => lookup.out);
    expect(asks.every((out) => out.reason_code === "ambiguous_person"), JSON.stringify(asks)).toBe(true);
    const first = asks[0]!.ask_exactly ?? "";
    const later = asks.at(-1)!;
    expect(first, "the first question does not offer both people").toMatch(/Hartwell[\s\S]*Pike|Pike[\s\S]*Hartwell/);
    expect(later.asked_before, "a question asked again is not marked as asked before").toBe(true);
    expect(later.ask_exactly ?? "", "the repeat does not offer both people").toMatch(/Hartwell[\s\S]*Pike|Pike[\s\S]*Hartwell/);
    expect((later.ask_exactly ?? "").length, `the repeat is not shorter:\n${first}\n${later.ask_exactly}`).toBeLessThan(first.length);
  }),
];
