/**
 * ============================================================================
 * THE REPLY NEVER CARRIES THE MODEL'S OWN REASONING (QA's Bubbles re-run, 22 Nov 2026, A13)
 * ============================================================================
 *
 * Live: "The manager's request to add this is about the card on screen (the open draft), not an older form on file." The
 * reply is read by the manager. "The manager" is the app's own name for them in every tool result and note the model is
 * given, so a reply sentence that speaks of the manager in the third person is the model narrating those notes, never an
 * answer. The check is that one term of the app's own vocabulary; no list of phrasings.
 */

const SENTENCES = /(?<=[.!?])\s+|\n+/;
const THIRD_PERSON = /\bthe manager(?:'s|s'|s)?\b/i;

/** Whether a sentence of the reply speaks of the manager in the third person. */
export function speaksOfTheManager(reply: string): boolean {
  return reply.split(SENTENCES).some((sentence) => THIRD_PERSON.test(sentence));
}

/** The reply without those sentences; empty when nothing else is left (the caller keeps the reply then). */
export function withoutManagerReasoning(reply: string): string {
  return reply
    .split("\n")
    .map((line) => line.split(/(?<=[.!?])\s+/).filter((sentence) => !THIRD_PERSON.test(sentence)).join(" "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
