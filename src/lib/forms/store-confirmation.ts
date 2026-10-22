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

type Turns = readonly { role: string; content: string; formProposal?: { status?: string } | null }[];

function lastAssistant(history: Turns): string | null {
  const turn = [...history].reverse().find((entry) => entry.role === "assistant");
  return typeof turn?.content === "string" ? turn.content : null;
}

/**
 * Whether the last thing Bubbles said was a question about which store: its
 * wording, or (QA F-12) an open card still waiting for its store — whichever
 * of `locationQuestion`'s wordings asked it ("More than one store matches …").
 */
export function storeQuestionOpen(history: Turns): boolean {
  const asked = lastAssistant(history);
  if (asked !== null && STORE_QUESTION.test(asked)) return true;
  const turn = [...history].reverse().find((entry) => entry.role === "assistant");
  return turn?.formProposal?.status === "needs_location";
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

/**
 * The opening words of a change of mind, up to the store they name (QA F-12):
 * "sorry, it's …", "no wait, it's …", "actually …". Anchored at the start, so
 * a store merely mentioned later in a sentence is not a correction.
 */
const CORRECTION_LEAD =
  /^\s*(?:(?:no|nope|oh|oops|sorry|wait|actually|correction|my\s+(?:mistake|bad)|i\s+meant|rather|instead)\b[\s,.!:;-]*)+(?:(?:it'?s|it\s+is|that'?s|that\s+is|make\s+it|should\s+be|use|at|in)\b\s*)?/i;

/** "it's Kearney", "at Kearney": the store with the words in front of it. */
function replyCore(text: string): string {
  return text.replace(/^(?:it'?s|it\s+is|at|in)\s+/i, "").trim();
}

/** A short turn that is nothing but a store: "Omaha", "the Omaha store", "store 264", "it's Kearney". */
export function bareStoreReply(turn: string, index: StoreIndex = ROSTER_STORE_INDEX) {
  const text = turn.trim().replace(/[.!]+$/, "").trim();
  if (!text || text.split(/\s+/).length > MAX_BARE_WORDS || /[?]/.test(text)) return null;
  const resolution = resolveStoreText(replyCore(text), index);
  return resolution.kind === "not_found" ? null : resolution;
}

/**
 * A change of mind that names a store (QA F-12), whether or not a store
 * question is open: what it names and the words that name it. A bare number
 * is not a store here — "actually 264" needs "store" or "#".
 */
export function storeCorrection(turn: string, index: StoreIndex = ROSTER_STORE_INDEX) {
  const lead = CORRECTION_LEAD.exec(turn);
  if (!lead || lead[0].trim() === "") return null;
  const rest = turn.slice(lead[0].length).trim().replace(/[.!]+$/, "").trim();
  if (/^\d{1,4}$/.test(replyCore(rest))) return null;
  const resolution = bareStoreReply(rest, index);
  return resolution ? { resolution, text: rest } : null;
}

/**
 * A store reply in the shape the sentence reader takes (QA F-12): "66" is read
 * as "store 66" (a number needs its place word there), a name as "at … store".
 */
export function storeReplyText(reply: string): string {
  const core = replyCore(reply.trim().replace(/[.!]+$/, "").trim());
  if (/^\d{1,4}$/.test(core)) return `store ${core}`;
  if (/^#\s*\d{1,4}$/.test(core) || /^(?:store|location)\b/i.test(core)) return core;
  return `at ${core} store`;
}

/**
 * The manager turns that answered a store question (QA F-12), so an answer
 * still counts on later turns ("66", then "she was late again today").
 */
export function storeAnswerTurns(history: Turns, index: StoreIndex = ROSTER_STORE_INDEX): Set<string> {
  const answered = new Set<string>();
  history.forEach((turn, at) => {
    if (turn.role !== "user" || typeof turn.content !== "string") return;
    if (storeQuestionOpen(history.slice(0, at)) && bareStoreReply(turn.content, index)) answered.add(turn.content.trim());
  });
  return answered;
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
  // "sorry, it's Omaha", "no wait, it's the West Dodge store" (QA F-12).
  if (storeCorrection(turn, index)) return true;
  const reading = readLocation(turn, index);
  const names = reading.mentions.length > 0 || reading.unmatched.length > 0;
  if (names && CORRECTION.test(turn)) return true;
  if (storeQuestionOpen(history)) return names || bareStoreReply(turn, index) !== null;
  return false;
}
