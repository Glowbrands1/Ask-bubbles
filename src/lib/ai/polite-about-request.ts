import { politeAboutStaysCardEnabled } from "@/lib/config/chat-quality-flags";

import type { AskRequest } from "./types";

/**
 * ============================================================================
 * "CAN YOU MAKE IT FOR <X>" ON AN OPEN CARD IS THE CARD'S TURN (POLITE_ABOUT_STAYS_CARD_ENABLED, default off)
 * ============================================================================
 *
 * The Bubbles live tester (QA, 8 Nov 2026; the same with round 4's flags): with a Coaching card open, "can you make it
 * for missing out monthly meeting" was answered as a policy question ("For a missed monthly meeting, the relevant
 * policy is …") with no card, and the next turn brought the card back. "make it for missing our monthly meeting" (no
 * "can you") kept the card: the polite lead is what the proposal could not read past. The turn is not read as a
 * question (it asks to act); the proposal for it returned nothing.
 *
 * With the flag on, while a card is open (no draft yet), a polite request to change what the form is for — "can /
 * could / would / will you (please) make it / this / the form (be) for / about <X>" — reaches the proposal without
 * its polite lead, as "make it for <X>". Nothing else changes; the manager's words stay in the history. Off, the
 * question as it was.
 */
const POLITE_ABOUT =
  /^\s*(?:(?:hey|hi|ok(?:ay)?|so)[\s,]+)?(?:can|could|would|will)\s+(?:you|u)\s+(?:please\s+|pls\s+)?(make\s+(?:it|this|that|the\s+(?:form|document|coaching(?:\s+(?:form|document))?|ca|c\/a|corrective\s+action(?:\s+form)?|write-?up))\s+(?:be\s+)?(?:for|about)\s+\S[^?]*?)\s*\?*\s*$/i;

/** The manager's turn for the proposal: without the polite lead when the flag is on and it applies; else as it was. */
export function withoutPoliteLeadOnCard(request: Pick<AskRequest, "question" | "continueProposalTemplateKey">): string {
  if (!politeAboutStaysCardEnabled() || !request.continueProposalTemplateKey) return request.question;
  const found = POLITE_ABOUT.exec(request.question);
  return found ? found[1]! : request.question;
}
