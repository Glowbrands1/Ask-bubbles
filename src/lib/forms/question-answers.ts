import { dateAnswerAppliedEnabled } from "@/lib/config/chat-quality-flags";

import { POSITION_QUESTION_TAG, readPositionAnswer } from "./employee-position";
import { DATE_QUESTION_TAG, dateAnswerTurns, readDateChoice } from "./incident-dates";
import { readLocationMentions } from "./location-mention";
import { correctsTheEmployee, extractJobTitle } from "./proposal";

/** The fixed words of the store question, so it is asked once and its answer recognised. */
export const STORE_QUESTION_TAG = "which store they work at";

/**
 * The manager turns that DIRECTLY ANSWER a question Ask Bubbles asked about the
 * employee's position, the form's date or the employee's store.
 *
 * Such a turn is often the whole message — "barista", "most recent", "Kearney" —
 * and the typed-name reader takes a whole short message for a name, so it would
 * replace the employee on the proposal AND make the create route's currency
 * check refuse the card. The name readers skip these turns; the location, title
 * and date readers still see them.
 *
 * ONLY A TURN THAT REALLY IS THAT ANSWER. A reply after the position question can
 * just as well be "actually make it Jordan Testperson", and a person's name is
 * indistinguishable from a position when it is two plain words — so a correction,
 * or a two-word reply that is not a known title, stays a name. Returns the
 * trimmed contents.
 */
export function answersToOpenQuestions(
  conversation: readonly { role: string; content: string }[],
): Set<string> {
  const answered = new Set<string>();
  for (let index = 1; index < conversation.length; index += 1) {
    const turn = conversation[index]!;
    const before = conversation[index - 1]!;
    if (turn.role !== "user" || before.role !== "assistant" || typeof before.content !== "string") continue;
    const reply = String(turn.content).trim();
    if (reply === "" || correctsTheEmployee(reply)) continue;

    const isAnswer =
      (before.content.includes(POSITION_QUESTION_TAG) && answersPosition(reply)) ||
      (before.content.includes(DATE_QUESTION_TAG) && readDateChoice(reply, ["0000-00-00"], "9999-12-31") !== null) ||
      (before.content.includes(STORE_QUESTION_TAG) && readLocationMentions(reply).length > 0);
    if (isAnswer) answered.add(reply);
  }
  // DATE_ANSWER_APPLIED_ENABLED: "most recent" answering the date question a turn or two back is no name either.
  if (dateAnswerAppliedEnabled()) for (const reply of dateAnswerTurns(conversation as never)) answered.add(reply);
  return answered;
}

function answersPosition(reply: string): boolean {
  if (readPositionAnswer(reply) === null) return false;
  const words = reply.replace(/[.!\s]+$/g, "").split(/\s+/);
  return words.length === 1 || extractJobTitle(reply) !== null || /^(?:she|he|they)\b|^(?:her|his|their|the)\b|^(?:position|title|role)\b|^an?\s/i.test(reply);
}
