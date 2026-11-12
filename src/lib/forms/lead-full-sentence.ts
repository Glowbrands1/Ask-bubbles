import { formsBelowNeedsFormsEnabled, leadFullSentenceEnabled } from "@/lib/config/chat-quality-flags";

/**
 * ============================================================================
 * A REPLY NEVER ENDS AT "I CAN PREPARE:"
 * ============================================================================
 *
 * LEAD_FULL_SENTENCE_ENABLED (QA's backlog B7; Pau via QA, 5 Nov 2026, sf-b6, both apps). The answering model's reply
 * about the detail the manager added already said what comes next; the app then ended it with "Based on what you've
 * described, I can prepare:" and nothing after it — the form choices it introduces were not what the manager saw. On:
 * the lead is a full sentence when the reply offers form choices ("… I can prepare one of the forms below."), and
 * goes when it offers none. A reply without the lead is left as it is. Pure.
 */

const LEAD = /\n*Based on what you've described, I can prepare:\s*$/;

export function withLeadFullSentence<T extends { content: string; formSelection?: unknown }>(answer: T): T {
  if (!leadFullSentenceEnabled() || !LEAD.test(answer.content)) return answer;
  const offers = Boolean(answer.formSelection);
  const content = offers
    ? answer.content.replace(LEAD, (lead) => lead.replace(/I can prepare:\s*$/, "I can prepare one of the forms below."))
    : answer.content.replace(LEAD, "").trimEnd();
  return { ...answer, content };
}

const FORMS_BELOW = /\n*Based on what you've described, I can prepare one of the forms below\.\s*$/;

/**
 * FORMS_BELOW_NEEDS_FORMS_ENABLED (QA's Bubbles 17i live test, 11 Nov 2026): the turn's last step. "… I can prepare one
 * of the forms below." stays only when the reply still carries form choices: a later step that set the choices aside
 * (or a card shown instead) leaves no forms below it. Pure; off, as it was.
 */
export function withFormsBelowOnlyWithForms<T extends { content: string; formSelection?: unknown }>(answer: T): T {
  if (!formsBelowNeedsFormsEnabled() || answer.formSelection || !FORMS_BELOW.test(answer.content)) return answer;
  return { ...answer, content: answer.content.replace(FORMS_BELOW, "").trimEnd() };
}
