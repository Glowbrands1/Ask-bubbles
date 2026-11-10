import { addressOnlyAsksWhoEnabled } from "@/lib/config/chat-quality-flags";
import type { AskResponse } from "@/lib/ai/types";

/**
 * ============================================================================
 * "CORRECTIVE ACTION FOR 123 MAIN STREET" ASKS WHO (ADDRESS_ONLY_ASKS_WHO_ENABLED)
 * ============================================================================
 *
 * QA, 4 Nov 2026 (port from the sibling app): "Corrective action for 123 Main Street" made no card and fell through to the
 * knowledge answer, which never asked who the form is for. With the flag on, a request that is only a form's name and
 * "for <house number> <street>", answered with no card, is answered with the sibling app's address question instead. Pure.
 */
const FORM_FOR_ADDRESS =
  /^\s*(?:(?:i\s+need|need|create|make|write(?:\s+up)?|start|do|draft)\s+(?:me\s+)?(?:a|an)?\s*)?(corrective\s+action|ca|c\/a|write[- ]?up|coaching)(?:\s+form)?\s+for\s+(\d+[a-z]?\s+[a-z][\w.'-]*(?:\s+[a-z][\w.'-]*){0,3})\s*[.!]?\s*$/i;

/** "Corrective action for 123 Main Street" → the form's name and "Main Street"; anything else → null. */
export function formForAddressOnly(question: string): { form: string; street: string } | null {
  const read = FORM_FOR_ADDRESS.exec(question);
  if (!read) return null;
  const form = /coaching/i.test(read[1]!) ? "Coaching Form" : "Corrective Action Form";
  return { form, street: read[2]!.replace(/^\d+[a-z]?\s+/i, "").trim() };
}

/** The question, in the sibling app's words (its ADDRESS_NOT_PERSON guard's). */
function addressNotPersonAsk(form: string, name: string): string {
  return `Who is this **${form}** for? "${name}" reads as a street address, not a person — tell me the employee's full name, and I'll put it on the card.`;
}

export function withAddressOnlyAsksWho(answer: AskResponse, question: string): AskResponse {
  if (!addressOnlyAsksWhoEnabled() || answer.formProposal || answer.formOpened) return answer;
  const read = formForAddressOnly(question);
  if (!read) return answer;
  const { formSelection: _dropped, ...rest } = answer;
  void _dropped;
  return { ...rest, content: addressNotPersonAsk(read.form, read.street), citations: [] };
}
