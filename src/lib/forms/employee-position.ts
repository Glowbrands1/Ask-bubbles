import { formInputFidelityEnabled, positionAnswerGuardEnabled, positionAnswerNotASentenceEnabled } from "@/lib/config/chat-quality-flags";

import { spokenDates } from "./relative-date";

/**
 * ============================================================================
 * THE EMPLOYEE'S POSITION: FROM WOVEN, FROM THE MANAGER, OR ASKED — NEVER GUESSED
 * ============================================================================
 *
 * Admin feedback, 16 Oct 2026: "I would like it to ask the position of the
 * employee." Job Title on a Corrective Action or Coaching Form was filled only
 * from a title the manager happened to type, while the Woven directory holds
 * every employee's current position (`position_name`) and nothing read it. The
 * Job Title line therefore came back blank on every form Ask Bubbles drafted.
 *
 * THE ORDER, AND WHY:
 *
 *   1. THE MANAGER'S OWN WORDS — a title they typed, or the answer to the
 *      position question below. They know whether Woven is stale.
 *   2. WOVEN'S POSITION for the employee the directory matched exactly (or the
 *      manager confirmed). Authoritative, but read back, never silent: a
 *      position that changed last week is the manager's to correct.
 *   3. ASKED, once. No title anywhere is a question, not a blank passed off as
 *      complete, and not a title inferred from the template or the incident.
 *
 * PURE. The directory read lives in `employee-roster.ts`.
 */

/** The fixed words of the question, so the next turn can recognise its answer. */
export const POSITION_QUESTION_TAG = "position (job title)?";

export function positionQuestion(who: string): string {
  return `What is **${who}**'s ${POSITION_QUESTION_TAG} I don't have one from Woven or from what you've told me. Tell me here, or fill in Job Title on the form — I won't guess it.`;
}

/** Whether an assistant turn asked for the position. */
export function askedForPosition(content: string): boolean {
  return typeof content === "string" && content.includes(POSITION_QUESTION_TAG);
}

const LEAD_INS: readonly RegExp[] = [
  /^(?:she|he|they)(?:['’]s|['’]re| is| are| was)\s+(?:an?\s+|the\s+)?/i,
  /^(?:her|his|their)\s+(?:current\s+)?(?:position|title|job title|role)\s+(?:is|was)\s+(?:an?\s+|the\s+)?/i,
  /^(?:the\s+)?(?:position|title|job title|role)\s*(?:is|:|-)\s*(?:an?\s+|the\s+)?/i,
  /^(?:an?|the)\s+/i,
];

const NOT_A_POSITION = new Set([
  "yes", "no", "yeah", "yep", "nope", "ok", "okay", "sure", "unknown", "idk", "none", "n/a", "na", "skip",
  "not sure", "i don't know", "dont know", "don't know",
]);

/*
 * POSITION_ANSWER_GUARD_ENABLED (QA, 26 Oct 2026, three tester drafts): with
 * the position question open, a reply to the warning-level or payroll question
 * — "This is a verbal", "Written", "Verbal", "verbal warning", "no payroll
 * deduct", "$25", "i dont know the amount" — was saved as the Job Title. Such
 * a reply is not a position.
 */
const ANSWERS_ANOTHER_QUESTION =
  /^(?:(?:it|this|that)(?:['’]s|\s+is|\s+will\s+be|\s+should\s+be)\s+)?(?:an?\s+)?(?:(?:verbal|written|final)(?:\s+(?:written\s+)?(?:warning|ca|corrective\s+action))?|(?:yes|no)?[\s,]*(?:payroll|pay\s*roll|payrol)\b.*|\$\s?\d+(?:\.\d{2})?|(?:i\s+)?(?:do\s*n['’]?t|dont|do\s+not)\s+know\b.*)[.!\s]*$/i;

/*
 * FORM_INPUT_FIDELITY_ENABLED (PR #92, the live replays of 24 Oct 2026; rebuilt on main 11 Nov 2026): with the
 * position question open, a bare "yesterday" was saved as Job Title "Yesterday". A reply that is only a day — a
 * calendar date or a spoken one — is the incident's date. Any fixed reference day reads the words; the date itself is
 * not used here.
 */
const DATE_REFERENCE_DAY = "2026-06-15";
const DATE_FILLER = /\b(?:on|it was|was|the|of)\b/gi;

function saysOnlyADate(text: string): boolean {
  const found = spokenDates(text, DATE_REFERENCE_DAY).filter((token) => token.iso);
  if (found.length === 0) return false;
  let rest = text;
  for (const token of [...found].sort((a, b) => b.index - a.index)) rest = rest.slice(0, token.index) + " " + rest.slice(token.end);
  return rest.replace(DATE_FILLER, " ").replace(/[\s.,!]+/g, "") === "";
}

/*
 * POSITION_ANSWER_NOT_A_SENTENCE_ENABLED (QA's live Bubbles 17w test, 13 Nov 2026): a card for someone with no Woven
 * position asked for it, and the manager's next turn, "she gets a verbal warning", became Position "She Gets A Verbal
 * Warning". A reply that is a sentence about her (a pronoun and a verb other than "is/was/'s") or that names a level,
 * a warning, an earlier step or a payment is never a position answer. "she's a shift lead", "Team Member Part Time",
 * "keyholder" still are.
 */
const SENTENCE_ABOUT_HER = /^(?:(?:she|he|they)\s+(?!(?:is|was|are|were)\b)[a-z]+|(?:it|this|that)(?:['’]s|\s+is|\s+was)\b)/i;
/*
 * v2-Gate-Bubbles-3's probes on #889 (14 Nov 2026): with the flag on, "it's her second time", "she's a team lead i think",
 * "she's in training" and "she's new" were still read, and now announced ("Job title set to **It's Her Second Time**").
 * A hedge, an ordinal, "again" or "time(s)" is never part of a title.
 */
const NOT_A_TITLE_WORD =
  /(?:\$\s?\d|\b\d|\b(?:warning|warnings|write[- ]?ups?|verbal|written|final|coach(?:ed|ing)?|owes?|owed|owing|pay|paid|payroll|deduct\w*|late|tardy|no[- ]?show|absent|fired|terminat\w*|suspend\w*|signed|corrective|ca|again|(?:first|second|third|fourth|fifth|last|another|\d+(?:st|nd|rd|th)?)\s+times?|before|i\s+think|i\s+guess|i\s+believe|maybe|probably|not\s+sure)\b)/i;
/** "she's …" / "she is …": a title only when the rest names a role ("she's a shift lead"), never "she's new" or "she's in training". */
const PRONOUN_IS = /^(?:she|he|they)(?:['’]s|\s+is|\s+was|['’]re|\s+are)\s+(.+)$/i;
const ROLE_WORD =
  /\b(?:lead|leader|manager|member|holder|keyholder|key-holder|supervisor|director|associate|assistant|consultant|operator|cashier|trainer|maker|crew|staff|specialist|coordinator|attendant|clerk|owner|captain|agm|gm|asm|sm|tm|kh)\b/i;

function notAPositionSentence(reply: string): boolean {
  if (SENTENCE_ABOUT_HER.test(reply) || NOT_A_TITLE_WORD.test(reply)) return true;
  const said = PRONOUN_IS.exec(reply.trim().replace(/[.!\s]+$/g, ""));
  return said !== null && !ROLE_WORD.test(said[1]!);
}

function titleCase(phrase: string): string {
  return phrase
    .split(/\s+/)
    .map((word) => (word === word.toUpperCase() && word.length <= 5 ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(" ");
}

/**
 * The position a manager gave in reply to `positionQuestion`: a short phrase
 * ("makery associate", "she's a shift lead", "title is Operator"). A reply that
 * is a question, a refusal or a sentence about something else is not one.
 */
export function readPositionAnswer(reply: string): string | null {
  let text = (reply ?? "").trim().replace(/[.!\s]+$/g, "");
  if (text === "" || /\?\s*$/.test(text)) return null;
  for (const lead of LEAD_INS) {
    if (lead.test(text)) {
      text = text.replace(lead, "");
      break;
    }
  }
  text = text.trim();
  if (text === "" || NOT_A_POSITION.has(text.toLowerCase())) return null;
  // POSITION_ANSWER_GUARD_ENABLED: "This is a verbal", "Written", "no payroll deduct" answer other questions.
  if (positionAnswerGuardEnabled() && ANSWERS_ANOTHER_QUESTION.test(String(reply).trim())) return null;
  // FORM_INPUT_FIDELITY_ENABLED: a bare date ("yesterday", "Oct 20", "10/20") answers the date question, never the position.
  if (formInputFidelityEnabled() && saysOnlyADate(text)) return null;
  // POSITION_ANSWER_NOT_A_SENTENCE_ENABLED: "she gets a verbal warning" is about the incident, never her title.
  if (positionAnswerNotASentenceEnabled() && notAPositionSentence(String(reply).trim())) return null;
  const words = text.split(/\s+/);
  if (words.length > 5 || !/^[A-Za-z][A-Za-z&/'’.\- ]*$/.test(text)) return null;
  return titleCase(text);
}

type Turn = { readonly role: string; readonly content: string };

/**
 * The position the manager has already given in answer to an earlier question,
 * read over the whole conversation: an assistant turn that asked, and the
 * manager turn right after it.
 */
export function positionAnsweredIn(conversation: readonly Turn[]): string | null {
  let answer: string | null = null;
  for (let index = 1; index < conversation.length; index += 1) {
    const turn = conversation[index]!;
    if (turn.role !== "user" || !askedForPosition(conversation[index - 1]!.content) || conversation[index - 1]!.role !== "assistant") continue;
    const read = readPositionAnswer(turn.content);
    if (read) answer = read;
  }
  return answer;
}

/** Whether the last turn is a bare answer to a pending position question. */
export function answersPositionQuestion(history: readonly Turn[], question: string): boolean {
  const lastAssistant = [...history].reverse().find((turn) => turn.role === "assistant");
  return !!lastAssistant && askedForPosition(lastAssistant.content) && readPositionAnswer(question) !== null;
}

/** Whether the position has been asked for anywhere in the conversation already. */
export function positionAlreadyAsked(history: readonly Turn[]): boolean {
  return history.some((turn) => turn.role === "assistant" && askedForPosition(turn.content));
}

/** The same title, however it is capitalised or spaced. */
export function samePosition(a: string, b: string): boolean {
  const fold = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return fold(a) === fold(b);
}
