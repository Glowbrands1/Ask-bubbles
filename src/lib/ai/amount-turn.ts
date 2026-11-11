import { amountTurnStaysEnabled } from "@/lib/config/chat-quality-flags";

import type { AskRequest, AskResponse } from "./types";

/**
 * AMOUNT_TURN_STAYS_ENABLED (QA BF7b live, conv_mvqn7a6p2mm85ap, 27 Oct 2026):
 * with a Corrective Action card open, "i dont know the amount" — the answer to
 * the payroll amount — was routed to the policy answer and came back as "I
 * don't have a payroll deduction figure in the sources available to me …".
 * The form path gave nothing for that turn, so it fell through to retrieval.
 * With the flag on, while a card is open, a turn that only answers the amount
 * ("i dont know the amount", "not sure of the amount", "idk the amount",
 * "$25") is answered as part of the form instead, and the intake stays open
 * for the next turn (the browser's continuation looks past a plain reply).
 */
const UNKNOWN_AMOUNT =
  /^\s*(?:i\s+)?(?:do\s*n['’]?t|dont|do\s+not|don't)\s+know(?:\s+(?:what\s+)?the)?\s+(?:amount|figure|total)|^\s*(?:not\s+sure|unsure)\s+(?:of|about|what)\s+(?:the\s+)?(?:amount|figure|total)|^\s*idk\s+(?:the\s+)?(?:amount|figure|total)/i;
const AMOUNT = /^\s*(?:it'?s\s+|about\s+|around\s+)?\$\s?\d[\d,]*(?:\.\d{2})?\s*[.!]?\s*$/;

export function answersOnlyTheAmount(question: string): boolean {
  const text = (question ?? "").trim();
  return text.length <= 60 && (UNKNOWN_AMOUNT.test(text) || AMOUNT.test(text));
}

export const AMOUNT_UNKNOWN_REPLY =
  "Noted — I'll leave the **Payroll deduction amount** blank for you to fill on the form once you know it.";

export function amountTurnReply(request: AskRequest): AskResponse | null {
  if (!amountTurnStaysEnabled() || !request.continueProposalTemplateKey) return null;
  if (!answersOnlyTheAmount(request.question)) return null;
  const figure = /\$\s?\d[\d,]*(?:\.\d{2})?/.exec(request.question)?.[0]?.replace(/\s/g, "");
  return {
    content: figure
      ? `Noted — **Payroll deduction amount:** ${figure}. Fill it on the form if the draft does not show it.`
      : AMOUNT_UNKNOWN_REPLY,
    citations: [],
    coverage: "not_applicable",
  };
}
