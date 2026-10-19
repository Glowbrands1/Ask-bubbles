import { AFFIRMATIVE } from "./employee-match";
import { ROSTER_STORE_INDEX, readLocation } from "./location-mention";
import { resolveStoreText, type StoreIndex } from "@/lib/stores/resolver";

/**
 * ============================================================================
 * ANSWERING A STORE QUESTION, AND CHANGING THE STORE, IN A LATER TURN
 * ============================================================================
 *
 * "Which store is this about?" is answered "Omaha", "the Omaha store", "store
 * 264" or "yes" (to "I read Kearny as Kearney, NE — is that the store?"). A
 * manager also changes their mind: "Actually, use the Omaha store."
 *
 * Neither names an employee or an incident, so neither used to read as part of
 * the open form request. They do now — but only where a form is open, and the
 * store they name goes through the same resolver, the same scope check and the
 * same confirmation rules as one named in the first message. Nothing here
 * carries a store forward: the history is the browser's, so a "yes" only picks
 * a store the assistant's question named by its registered number, and that
 * store is still checked against the manager's own scope.
 */

/** Every wording `locationQuestion` ends a store question with. */
const STORE_QUESTION = /(?:which (?:of your )?stores? (?:is this about|do you mean)\?|is that the store\?)/i;
const CONFIRM_QUESTION = /I read \*\*[^*]+\*\* as \*\*([^*]+)\*\* — is that the store\?/;

type Turns = readonly { role: string; content: string }[];

function lastAssistant(history: Turns): string | null {
  const turn = [...history].reverse().find((entry) => entry.role === "assistant");
  return typeof turn?.content === "string" ? turn.content : null;
}

/** Whether the last thing Bubbles said was a question about which store. */
export function storeQuestionOpen(history: Turns): boolean {
  const asked = lastAssistant(history);
  return asked !== null && STORE_QUESTION.test(asked);
}

/** "Yes" to a store the last question proposed: its registered number, to be re-authorised by the caller. */
export function readStoreConfirmation(history: Turns, question: string): { code: string } | null {
  const asked = lastAssistant(history);
  if (!asked || !AFFIRMATIVE.test(question)) return null;
  const label = CONFIRM_QUESTION.exec(asked)?.[1];
  const code = label ? /\(Store ([A-Za-z0-9-]+)\)\s*$/.exec(label.trim())?.[1] : undefined;
  return code ? { code } : null;
}

/**
 * "Actually, use the Omaha store." A later turn that NAMES a store AND says it
 * is a change replaces the store an earlier turn named. A later turn that only
 * mentions another store in passing does not: both are then read together, and
 * two stores is a question rather than a pick.
 */
export const CORRECTION =
  /\b(?:actually|instead|rather|sorry|oops|my (?:mistake|bad)|i meant|meant|correction|switch|change(?:\s+(?:it|the store|that))?(?:\s+to)?|use|make it|should be|it'?s|it is|not\b[^.!?]{0,40}\b(?:but|use))\b/i;

const MAX_BARE_WORDS = 6;

/** A short turn that is nothing but a store: "Omaha", "the Omaha store", "store 264". */
export function bareStoreReply(turn: string, index: StoreIndex = ROSTER_STORE_INDEX) {
  const text = turn.trim().replace(/[.!]+$/, "");
  if (!text || text.split(/\s+/).length > MAX_BARE_WORDS || /[?]/.test(text)) return null;
  const resolution = resolveStoreText(text, index);
  return resolution.kind === "not_found" ? null : resolution;
}

/**
 * Whether a turn is about the store of the open form: a change ("Actually, use
 * the Omaha store"), or the answer to a store question. Not a question, and not
 * a passing mention.
 */
export function continuesStore(
  turn: string,
  history: Turns,
  index: StoreIndex = ROSTER_STORE_INDEX,
): boolean {
  if (/\?\s*$/.test(turn.trim())) return false;
  if (readStoreConfirmation(history, turn)) return true;
  const reading = readLocation(turn, index);
  const names = reading.mentions.length > 0 || reading.unmatched.length > 0;
  if (names && CORRECTION.test(turn)) return true;
  if (storeQuestionOpen(history)) return names || bareStoreReply(turn, index) !== null;
  return false;
}
