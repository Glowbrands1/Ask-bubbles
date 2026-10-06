import { COMPANY_FORMS } from "@/config/company/forms";
import type { ChatMessage } from "@/types";

/**
 * ============================================================================
 * "GUIDANCE, OR A FORM?" — AND THE ANSWER TO IT
 * ============================================================================
 *
 * Ported from the reference platform's `form-clarification.ts`. The question
 * `proposeFormForTurn` asks when a manager writes "coach Avery" for a form
 * that declares `clarifyOn` (see `clarifyFormOrGuidance` there), and the
 * reader for the reply that chooses the form. Pure and separate from the
 * orchestrator because `answerQuestion` needs it BEFORE the forms branch
 * runs: "the form" names no form and carries no continuation, so without this
 * the reply would never reach the form path at all.
 *
 * GENERALISED: the reference platform's question named one form. Here it names
 * whichever form asked it, and the reply is resolved back to that form by its
 * NAME in the question — so the key is never taken from the browser.
 *
 * What it confers is a routing decision and nothing else. The template key is
 * revalidated against the published library and the actor's permission, and
 * the employee is re-read from the manager's own turns, exactly as for a typed
 * request — so an assistant turn edited in browser storage gains nothing.
 */
export const FORM_OR_GUIDANCE_QUESTION = "Do you want guidance, or do you want me to start a";

const CHOOSES_THE_FORM =
  /^(?:(?:yes|yeah|yep|ok|okay)[,.!\s]+)?(?:(?:the|a)\s+)?(?:(?:start|do|make|open)\s+(?:it|one|the\s+form|a\s+form)|form|forms|the\s+form|document(?:\s+it)?|paperwork|write[- ]?up|second(?:\s+one)?|option\s+(?:2|two|b)|2|the\s+latter)(?:\s+please)?[.!\s]*$/i;

/** The question, for the form the manager's verb pointed at. */
export function formOrGuidanceQuestion(formName: string, employeeName: string | null): string {
  return `${FORM_OR_GUIDANCE_QUESTION} ${formName}${employeeName ? ` for **${employeeName}**` : ""}?`;
}

/**
 * The template this turn chooses by answering the question above, or null.
 * The form is read back from the question's own wording — the registry name
 * it was asked with — never from anything the browser claims.
 */
export function formChosenByClarification(
  history: readonly Pick<ChatMessage, "role" | "content" | "error">[],
  question: string,
): string | null {
  const last = [...history].reverse().find((message) => message.role === "assistant");
  if (!last || last.error || !last.content.startsWith(FORM_OR_GUIDANCE_QUESTION)) return null;
  if (!CHOOSES_THE_FORM.test(question.trim())) return null;
  const asked = last.content.slice(FORM_OR_GUIDANCE_QUESTION.length).trim();
  const entry = COMPANY_FORMS.filter((form) => form.clarifyOn)
    .sort((a, b) => b.seed.name.length - a.seed.name.length)
    .find((form) => asked.startsWith(form.seed.name));
  return entry?.seed.key ?? null;
}

/** Whether this turn answers the clarification above by choosing the form. */
export function answersFormClarification(
  history: readonly Pick<ChatMessage, "role" | "content" | "error">[],
  question: string,
): boolean {
  return formChosenByClarification(history, question) !== null;
}
