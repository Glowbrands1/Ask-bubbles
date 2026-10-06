/**
 * True when a sentence asks rather than states. Questions are never read as
 * facts, corrections or intake answers.
 *
 * Ported from the reference platform's `isQuestion`, with one addition: an
 * opener followed by "not" — "did not show up", "is not answering her phone"
 * — is a statement about what happened, not a question.
 */
const QUESTION_OPENER =
  /^\s*(?:what|how|when|where|why|who|which|does|do|did|is|are|can|could|should|would|will|may|has|have)\b(?!\s+not\b)/i;

export function isQuestion(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.endsWith("?") || QUESTION_OPENER.test(trimmed);
}
