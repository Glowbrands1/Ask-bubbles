import { takeOffStaysCardEnabled } from "@/lib/config/chat-quality-flags";
import { takesPolicyOff } from "@/lib/forms/policy-set-aside";

import type { AskRequest } from "./types";

/**
 * ============================================================================
 * "TAKE THE POLICY OFF" WITH A CARD OPEN IS A CARD TURN
 * (TAKE_OFF_STAYS_CARD_ENABLED, default off; QA, 8 Nov 2026, relayed by coding 5)
 * ============================================================================
 *
 * With a Coaching Form card open, "take the attendance policy off the form" was answered as a policy question
 * ("A grounded answer from the policy manual.") with no card: the open intake reads a turn as carrying on only when
 * it names a person, a place, a date or an account, and a take-off says none of those. "take the policy off" on a
 * Corrective Action card read as a question (QUESTION_NOT_FORM) and went the same way. So PROPOSAL_POLICY_SET_ASIDE's
 * card reader never saw a card for that turn.
 *
 * With the flag on, a turn on an open card (no draft yet) whose every sentence takes a policy off
 * (`takesPolicyOff`, coding 5's reader) and is not a question is a card turn. It is never answered as a question, and
 * the card is proposed again from the manager's last turn before it, so the card's own readers (the policy set aside
 * among them) see this turn's words in the history and the question. Nothing else changes. Off, false.
 */
export function takeOffStaysCard(request: Pick<AskRequest, "question" | "continueProposalTemplateKey">): boolean {
  if (!takeOffStaysCardEnabled() || !request.continueProposalTemplateKey) return false;
  const sentences = (request.question ?? "")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return sentences.length > 0 && sentences.every((sentence) => !sentence.endsWith("?") && takesPolicyOff(sentence));
}

/** The question the card is proposed again from: the manager's last turn before this one, or this one. */
export function cardTurnQuestion(request: Pick<AskRequest, "question" | "history">): string {
  const users = (request.history ?? []).filter((turn) => turn.role === "user");
  return users.at(-1)?.content ?? request.question;
}
