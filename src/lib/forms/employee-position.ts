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
