import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * U21, QA's LIVE ROUND 3 ON PRODUCTION 1c71e11 (22 Nov 2026): THE WHOLE CHAT, T1–T12
 * ============================================================================
 *
 * Pau's admin login (all stores). The tester's turns, word for word; the people invented by the tester: Briony Kask
 * (Woven, Team Member PT, Omaha West Dodge) and Joelle Penrose (Woven, Team Member PT, Bellevue and Omaha West Dodge, with
 * three forms on file). With AGENT_LOOP_LIVE=1 the real model plays every turn.
 */

export const U21_R3_TURNS = [
  "corrective action",
  "briony kask",
  "This is what happened: She has recieved coaching on 9/22 for cleaning tasks not being completed. What was observed this weekend is that trash liners were not put into the trash cans after collecting trash, laundry was not done",
  "jba woven policys were acknowledged on 5/26/26",
  "payroll is not deductable",
  "verbal warning",
  "add the direct policy from the official manual that goes with this",
  "make the same corrective action but for joelle penrose",
  "no i want this to be a corrective action for a new person now",
  "make this for joelle instead of briony",
  "yes",
  "previous coaching: there was a store meeting in july 2026 and she signed the jba policys on 6/24/24",
] as const;

export const U21_BRIONY: DirectoryRow = { id: "e-briony-kask", firstName: "Briony", lastName: "Kask", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
export const U21_JOELLE: DirectoryRow = { id: "e-joelle-penrose", firstName: "Joelle", lastName: "Penrose", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-67", "loc-264"], positionName: "Team Member Part Time" };
export const U21_ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

/** Joelle's three forms on file, as the tester's card listed them. */
export function u21OnFile(t: ReplayContext): void {
  const row = (id: string, key: "dpoa" | "coaching", name: string, formDate: string) => ({
    id, ...t.templateIds!(key), variant_key: null, employee_role: null, location_id: WEST_DODGE.primaryAreaId, location_name: "Omaha, West Dodge Rd",
    created_by: "another-manager", created_by_role: "location_manager", source: "ask_sunny", status: "finalized", follow_up_date: null, archived_at: null,
    revises_instance_id: null, template_key: key, template_name: name, employee_name: "Joelle Penrose", form_date: formDate,
    created_at: `${formDate}T15:00:00Z`, updated_at: `${formDate}T15:00:00Z`,
  });
  (t.forms() as Record<string, unknown>[]).push(
    row("ca-joelle-1114", "dpoa", "Corrective Action Form", "2026-11-14"),
    row("cf-joelle-1116", "coaching", "Coaching Form", "2026-11-16"),
    row("ca-joelle-1116", "dpoa", "Corrective Action Form", "2026-11-16"),
  );
  t.checkOnForm!("ca-joelle-1114", { warning_type: ["verbal"] });
  t.checkOnForm!("ca-joelle-1116", { warning_type: ["verbal"] });
}

export function u21Start(t: ReplayContext): void {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, U21_BRIONY, U21_JOELLE]);
  t.as("admin", U21_ADMIN);
  u21OnFile(t);
}

const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").at(-1)?.text ?? "";
const back = (view: LoopView, text: string) => {
  const asks = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0);
  return Math.max(0, asks.length - 1 - asks.findIndex((turn) => turn.text === text));
};
/** What the model's history says the latest card held ("[card shown under this reply: … it held: <label> = \"…\"; …]"). */
function heldInHistory(view: LoopView): Record<string, string> {
  const line = [...view.turns].reverse().find((turn) => turn.role === "assistant" && /\[card shown under this reply:/.test(turn.text))?.text ?? "";
  const held = /it held: ([^\]]*)\]/.exec(line)?.[1] ?? "";
  return Object.fromEntries([...held.matchAll(/([^;=]+?) = "([^"]*)"/g)].map((match) => [match[1]!.trim(), match[2]!]));
}
const T = U21_R3_TURNS;
const ACCOUNT = "Briony received coaching on 9/22 for cleaning tasks not being completed. This weekend, trash liners were not put into the trash cans after collecting trash, and laundry was not done.";

/**
 * The stand-in, as the live model on 1c71e11: from T4 on it knows the card only from its history, and proposes the card
 * again with what that history says the card held plus the turn's change (QA's live round 3: with nothing held shown, it
 * proposed with the changed field alone, and the card lost its account).
 */
function u21Model(view: LoopView): LoopDecision {
  const message = said(view);
  const result = lastResult(view, "propose_form") as { card?: Record<string, string | null> } | null;
  if (result) {
    /* The card reply, as the live model writes it: the card's own lines under its labels. */
    const card = result.card;
    if (!card) return { text: "That card wasn't made." };
    const line = (label: string, value: string | null | undefined) => (value ? [`**${label}:** ${value}`] : []);
    return { text: ["Here's the Corrective Action Form.", ...line("Observation of Offense", card.observation), ...line("Prior actions", card.prior_actions), ...line("Policy", card.policy), ...line("Type of Warning", card.warning_level), ...(card.payroll_deduct ? [`**Is payroll deduct applicable?** ${card.payroll_deduct}`] : [])].join("\n\n") };
  }
  const held = heldInHistory(view);
  const seen = (text: string) => view.turns.some((turn) => turn.role === "user" && turn.text === text);
  const joelle = seen(T[7]);
  const person = joelle ? { employee_id: U21_JOELLE.id, person_evidence: evidenceFrom(view, "joelle penrose", back(view, T[7])) } : { employee_id: U21_BRIONY.id, person_evidence: evidenceFrom(view, "briony kask", back(view, T[1])) };
  const policy = { policy: headingWith(view, /care and cleaning/i) };
  if (message === T[0]) return { text: "Who is this Corrective Action Form for, and what happened?" };
  if (message === T[1]) return { text: "Got it, Briony Kask. What happened?" };
  if (message === T[2]) return { tool: "propose_form", input: { template_key: "dpoa", ...person, ...policy, what_happened: ACCOUNT, prior_actions: "Coaching — 09/22/2026 (cleaning tasks not being completed)" } };
  if (message === T[8]) return { text: "Got it — who is this new Corrective Action for, and what happened?" };
  if (message === T[10]) return { text: "The card above is still open; press Create when it looks right, or tell me what to change." };
  const base = {
    template_key: "dpoa", ...person, ...policy,
    ...(held["Observation of Offense"] ? { what_happened: held["Observation of Offense"].replace(/\bBriony\b/g, joelle ? "Joelle" : "Briony") } : {}),
    ...(held["Prior actions"] && !joelle ? { prior_actions: held["Prior actions"] } : {}),
  };
  if (message === T[3]) return { tool: "propose_form", input: { ...base, prior_actions: `${held["Prior actions"] ?? ""}; Policy acknowledgement — 05/26/2026` } };
  if (message === T[4]) return { tool: "propose_form", input: { ...base, payroll_deduct: "no", payroll_evidence: evidenceFrom(view, T[4]) } };
  if (message === T[5]) return { tool: "propose_form", input: { ...base, warning_level: "verbal", level_evidence: evidenceFrom(view, T[5]) } };
  if (message === T[6]) return { tool: "propose_form", input: base };
  if (message === T[7]) return { tool: "propose_form", input: { ...base, same_card_evidence: { ...evidenceFrom(view, T[7]), kind: "same_form" } } };
  /* T10 as live: the card asked for again ("this_card_for"), no level or payroll passed. */
  if (message === T[9]) return { tool: "propose_form", input: { ...base, same_card_evidence: { ...evidenceFrom(view, T[9]), kind: "this_card_for" } } };
  /* T12 as live: the stated prior steps, with what the card held. */
  return { tool: "propose_form", input: { ...base, prior_actions: "Store meeting — July 2026; Signed JBA policies — 06/24/2024" } };
}

export const NOV22_AGENT_LOOP_U21_R3_CHAT_CASES: ReplayCase[] = [
  {
    id: "nov22-u21-r3-whole-chat-card-keeps-what-it-held",
    title: "U21 round 3 (T1–T12 verbatim): the card keeps what it held when the model proposes it again — T10 \"make this for joelle instead of briony\" keeps the Verbal/payroll No Joelle's card had (T8), T12 \"previous coaching: …\" keeps the account, and no reply shows the history's bracketed card line",
    report: "QA's live round 3 (22 Nov 2026, U21): T10 dropped the copied level and payroll; T12 lost the account (\"What happened this time?\", no Create)",
    status: "fixed",
    async run(t) {
      u21Start(t);
      t.loopModel!(loopStandIn(u21Model));
      const thread = t.thread();
      const cards: { turn: number; issue: string | null; level: string | null; payroll: string | null; reply: string }[] = [];
      for (const [index, turn] of T.entries()) {
        const reply = await thread.say(turn);
        const card = thread.proposal as { issue?: string | null; warningLevel?: string | null; payrollDeduct?: string | null } | null;
        cards.push({ turn: index + 1, issue: card?.issue ?? null, level: card?.warningLevel ?? null, payroll: card?.payrollDeduct ?? null, reply: reply.content });
      }
      const at = (turn: number) => cards[turn - 1]!;
      expect(at(10), `T10 dropped the level or payroll Joelle's card held: ${JSON.stringify(cards.slice(6, 10)).slice(0, 2500)}`).toMatchObject({ level: "verbal", payroll: "no" });
      expect(at(12).issue ?? "", `T12 lost the account:\n${JSON.stringify(at(12))}`).toMatch(/trash liners/i);
      expect(at(12), "T12 lost the level or payroll").toMatchObject({ level: "verbal", payroll: "no" });
      expect(cards.filter((card) => /\[card shown under this reply/i.test(card.reply)).map((card) => card.turn), "a reply showed the history's card line").toEqual([]);
      /* T7 live: "That change isn't on the card yet: policy (…). Tell me again" — the policy the manager asked for is on the card. */
      expect(cards.filter((card) => /isn't on the card yet/i.test(card.reply)).map((card) => `T${card.turn}: ${card.reply}`), "a change was reported as not made").toEqual([]);
    },
  },
];
