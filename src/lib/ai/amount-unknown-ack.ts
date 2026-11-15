import { amountUnknownAckEnabled } from "@/lib/config/chat-quality-flags";
import { PAYROLL_DEDUCT_AMOUNT_QUESTION } from "@/lib/forms/payroll-deduct-amount";

import type { AskRequest, AskResponse } from "./types";

/**
 * AMOUNT_UNKNOWN_ACK_ENABLED (QA live, 27 Oct 2026; same flag in both apps):
 * after "yes payroll deduct" and the amount question, "i dont know the amount"
 * got the card back with no word about it. With the flag on, a turn that only
 * says the amount is not known, right after the amount question, is answered:
 *
 *   Noted — I'll leave the **Payroll deduction amount** blank for you to fill on the form once you know it.
 *
 * under the payroll Yes line of the card. Nothing on the card changes.
 */
export const AMOUNT_UNKNOWN_ACK =
  "Noted — I'll leave the **Payroll deduction amount** blank for you to fill on the form once you know it.";

const UNKNOWN_AMOUNT =
  /^(?:i\s+)?(?:do\s*n['’]?t|do\s+not)\s+know(?:\s+(?:what\s+)?the)?\s+(?:amount|figure|total)|^(?:not\s+sure|unsure)\s+(?:of|about|what)\s+(?:the\s+)?(?:amount|figure|total)|^idk\s+(?:the\s+)?(?:amount|figure|total)/i;
const ASKED = /Payroll deduction amount\**\s*\?/;

type Turn = { readonly role: string; readonly content: string };

/*
 * Ported from the sibling app (QA's review of the batch J salvage, 15 Nov 2026): the clause is read only after the
 * payroll answer in the same message, and must be the whole not-known clause (anchored), so "she was late, but I don't
 * know the amount of time" and "she was $40 short, idk the total" are never the payroll amount.
 */
const PAYROLL_ANSWER_ONLY =
  /^(?:(?:yes|yeah|yep|yup|no|nope|and)[,\s]+)?(?:(?:the\s+)?payroll[- ]?(?:deduct(?:ion|ed)?)?|pd)(?:\s+(?:is\s+)?(?:yes|no|applies|apply|applicable))?$/i;
const AMOUNT_NOT_KNOWN =
  /^(?:but\s+|and\s+)?(?:i\s+)?(?:do\s*n['’]?t|do\s+not)\s+know(?:\s+(?:what\s+)?the)?\s+(?:amount|figure|total)(?:\s+yet)?$|^(?:but\s+|and\s+)?(?:not\s+sure|unsure)\s+(?:of|about|what)\s+(?:the\s+)?(?:amount|figure|total)$|^(?:but\s+|and\s+)?idk\s+(?:the\s+)?(?:amount|figure|total)$/i;

const lastLine = (text: string) => (text ?? "").trim().split("\n").pop()?.trim().replace(/[.!]+$/, "") ?? "";

/** "yes payroll but I don't know the amount": the payroll answer, then the not-known amount, and nothing else. */
export function payrollAnswerThenAmountUnknown(text: string): boolean {
  const [answer, ...rest] = lastLine(text).split(/\s*(?:,|;|\bbut\b)\s*/i);
  if (rest.length === 0 || !PAYROLL_ANSWER_ONLY.test((answer ?? "").trim())) return false;
  const clauses = rest.map((clause) => clause.trim()).filter(Boolean);
  return clauses.length > 0 && clauses.every((clause) => AMOUNT_NOT_KNOWN.test(clause));
}

/** The last assistant turn asked for the Payroll deduction amount. */
export function askedTheAmount(history: readonly { readonly role: string; readonly content: unknown }[] | undefined): boolean {
  const lastAssistant = [...(history ?? [])].reverse().find((turn) => turn.role === "assistant")?.content ?? "";
  return ASKED.test(String(lastAssistant));
}

/**
 * The amount is not known and the words are about payroll: a reply to the amount question that starts with the
 * not-known words ("i dont know the amount"), or the payroll answer then the not-known amount in one message.
 */
export function saysAmountUnknown(text: string, history: readonly { readonly role: string; readonly content: unknown }[] | undefined): boolean {
  if (payrollAnswerThenAmountUnknown(text)) return true;
  const line = lastLine(text);
  return line.length <= 60 && UNKNOWN_AMOUNT.test(line) && askedTheAmount(history);
}

export function withAmountUnknownAck(response: AskResponse, request: AskRequest): AskResponse {
  if (!amountUnknownAckEnabled() || !response.formProposal || response.content.includes(AMOUNT_UNKNOWN_ACK)) return response;
  const history = (request.history ?? []) as readonly Turn[];
  if (!saysAmountUnknown(request.question, history)) return response;
  /*
   * Ported from the sibling app (batch J): "yes payroll but I don't know the amount" answers payroll and the amount in
   * one message, so the card's own amount question this turn is answered: the acknowledgement takes its place.
   */
  if (payrollAnswerThenAmountUnknown(request.question) && response.content.includes(PAYROLL_DEDUCT_AMOUNT_QUESTION)) {
    return { ...response, content: response.content.replace(PAYROLL_DEDUCT_AMOUNT_QUESTION, AMOUNT_UNKNOWN_ACK) };
  }
  if (!askedTheAmount(history)) return response;
  const lines = response.content.split("\n");
  const at = lines.findIndex((line) => /^Is payroll deduct applicable\? \*\*Yes\*\*/.test(line.trim()));
  const content = at < 0 ? `${response.content}\n\n${AMOUNT_UNKNOWN_ACK}` : [...lines.slice(0, at + 1), "", AMOUNT_UNKNOWN_ACK, ...lines.slice(at + 1)].join("\n");
  return { ...response, content };
}
