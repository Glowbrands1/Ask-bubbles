import { expect, vi } from "vitest";

import type { ChatFormProposal } from "@/types";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_OZREN, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * "YES" TO THE APP'S OWN NEXT-PERSON OFFER IS THAT PERSON'S REQUEST (CARD_PERSON_THIS_REQUEST on; port from the sibling app)
 * ============================================================================
 *
 * QA2's item B (21 Nov 2026), ported: "write CAs for <A> and <B>, both late on 11/14" (two propose_form calls in one
 * step) makes ONE card, and the reply ends offering the other person's form ("Want me to make the … for <B> next?").
 * With CARD_PERSON_THIS_REQUEST on, the manager's "yes" was refused: person_not_named (<B> was named before <A>'s card),
 * then person_change_not_asked (<A>'s card is open). The one-word answer to the app's own offer, for the first name it
 * offered, is <B>'s request; it is read from the app's own reply, never from a word list over the manager's messages.
 * Invented people from the loop roster (`loop-roster.ts`): Fenna Prewitt, Ozren Brack.
 */

const NEW_FLAG = "CARD_PERSON_THIS_REQUEST_ENABLED";
const REPORT = "QA2 (21 Nov 2026, port from the sibling app), item B: \"yes\" to the app's own \"Want me to make the … for <B> next?\" was refused with CARD_PERSON_THIS_REQUEST on";
type Person = { readonly id: string; readonly first: string; readonly full: string };
const FENNA: Person = { id: LOOP_FENNA.id, first: "Fenna", full: "Fenna Prewitt" };
const OZREN: Person = { id: LOOP_OZREN.id, first: "Ozren", full: "Ozren Brack" };

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-16T15:40:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

const ca = (who: Person) => ({ template_key: "dpoa", employee_id: who.id, what_happened: `${who.first} was late on 11/14.`, incident_date: "2026-11-14", policy: "Attendance" });

/** The reply a model writes from the turn's propose_form results; an offer it was given ends it. */
function replyFrom(view: LoopView): string {
  const results = view.results.filter((result) => result.tool === "propose_form").map((result) => result.output as { facts?: { reply_name?: string }; reason_code?: string; ask_exactly?: string; error?: string });
  const made = results.filter((result) => !result.reason_code);
  const offer = results.find((result) => result.reason_code && result.ask_exactly)?.ask_exactly;
  const refused = results.find((result) => result.reason_code && !result.ask_exactly);
  const lines = made.map((result) => `Here's the Corrective Action Form for **${result.facts?.reply_name ?? "them"}**. **Observation of Offense:** Late on 11/14.`);
  if (offer) lines.push(offer);
  if (!made.length && refused) lines.push(`${refused.reason_code}: ${refused.error ?? ""}`);
  return lines.join("\n\n");
}

export const NOV21_AGENT_LOOP_NEXT_PERSON_OFFER_YES_CASES: ReplayCase[] = [
  {
    id: "nov21-several-people-one-card-then-yes-card-person-on",
    title: "\"write CAs for fenna prewitt and ozren brack, both late on 11/14\" → one card, the reply offers the other person's form → \"yes\" builds that person's card with CARD_PERSON_THIS_REQUEST on, with no payroll or level taken from the \"yes\"",
    report: REPORT,
    status: "fixed",
    fixFlags: [NEW_FLAG],
    async run(t) {
      start(t);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (view.results.length === 0) return { tools: [{ tool: "propose_form", input: ca(FENNA) }, { tool: "propose_form", input: ca(OZREN) }] };
        return { text: replyFrom(view) };
      }));
      const thread = t.thread();
      const first = await thread.say("write CAs for fenna prewitt and ozren brack, both late on 11/14");
      const shown = (first.formProposal as ChatFormProposal | undefined)?.employeeName ?? "";
      expect([FENNA.full, OZREN.full], `no card shown: ${first.content}`).toContain(shown);
      const other = shown === FENNA.full ? OZREN : FENNA;
      expect(first.content, "the reply does not offer the other person's form (the case proves nothing)").toMatch(new RegExp(`Want me to make the Corrective Action Form for ${other.first} next\\?\\s*$`));

      // "yes": the model builds the offered card; it also tries the live mistake of taking "yes" as the payroll answer.
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (view.results.length === 0) return { tool: "propose_form", input: { ...ca(other), payroll_deduct: "yes", payroll_evidence: evidenceFrom(view, "yes") } };
        return { text: replyFrom(view) };
      }));
      const second = await thread.say("yes");
      const card = second.formProposal as ChatFormProposal | undefined;
      expect(card?.employeeName, `the "yes" did not build the offered card: ${second.content}`).toBe(other.full);
      expect(card?.payrollDeduct ?? null, "the \"yes\" to the offer was taken as the payroll answer").toBeNull();
      expect(card?.warningLevel ?? null, "the \"yes\" to the offer was taken as the level").toBeNull();
    },
  },
];
