import { formInputFidelityEnabled } from "@/lib/config/chat-quality-flags";

import { datesInText, listFormDates } from "./form-date-answer";
import { incidentDates } from "./incident-dates";
import { askedForPosition, positionAnsweredIn, readPositionAnswer } from "./employee-position";
import { statedJobTitle } from "./proposal";
import { spokenDates } from "./relative-date";
import { statedWarningLevel } from "./warning-level";

/**
 * A typed incident date, and a one-word follow-up, kept as the manager said them.
 *
 * Off, both helpers return the same value the callers already used:
 * `statedJobTitle ?? positionAnsweredIn`, and the form date already on the card.
 * "yesterday" is not a calendar date (`form-date-answer.ts`), so the draft is
 * dated today (`instances.ts`). A reply of "verbal" is also a short title
 * (`employee-position.ts`) when the position question shares the assistant's
 * last message with the warning question (`form-proposal.ts`).
 */

const PRIOR_STEP_NEAR =
  /\b(?:previous(?:ly)?|prior|already|coached|coaching|warned|warning|write[- ]?ups?|corrective action)\b/i;

const YES_NO = /^(?:yes|no|yeah|yep|nope|ok|okay)[\s.!]*$/i;

type Turn = { readonly role: string; readonly content: string };

/** The job title for the card. A bare warning, date, or yes/no is not one when the flag is on. */
export function fidelityAwareTitle(text: string, conversation: readonly Turn[]): string | null {
  const stated = statedJobTitle(text) ?? positionAnsweredIn(conversation);
  if (!formInputFidelityEnabled()) return stated;
  const company = statedJobTitle(text);
  if (company) return company;
  let answer: string | null = null;
  for (let index = 1; index < conversation.length; index += 1) {
    const turn = conversation[index]!;
    const before = conversation[index - 1]!;
    if (turn.role !== "user" || before.role !== "assistant" || !askedForPosition(before.content)) continue;
    if (bareReplyIsNotATitle(turn.content)) continue;
    const read = readPositionAnswer(turn.content);
    if (read) answer = read;
  }
  return answer;
}

/**
 * The form date when the card does not have one yet.
 *
 * One incident day the manager typed — "Oct 20", "10/20", "yesterday" — is
 * that day. Several incident days stay unset, so the existing "which date?"
 * question still dates the form today until they choose. No date at all stays
 * unset, and the draft defaults to today.
 */
export function fidelityFormDate(text: string, today: string, current: string | null | undefined): string | null {
  if (!formInputFidelityEnabled()) return current ?? null;
  if (current) return current;
  const incidents = incidentDates(text, today);
  if (incidents.length === 1) return incidents[0]!;
  if (incidents.length > 1) return null;
  const relative = relativeIncidentDates(text, today);
  return relative.length === 1 ? relative[0]! : null;
}

/** Calendar dates, plus a relative day when the flag is on. Off, the calendar list alone. */
export function fidelityGivenDates(notes: string, today: string): string[] {
  const calendar = listFormDates(notes, today).map((found) => found.iso);
  if (!formInputFidelityEnabled()) return calendar;
  return [...new Set([...calendar, ...relativeIncidentDates(notes, today)])];
}

/** Corrective drafts always, and Coaching drafts only when the flag is on. */
export function draftDateApplies(layoutFamily: string): boolean {
  if (layoutFamily === "corrective") return true;
  return formInputFidelityEnabled() && layoutFamily === "coaching";
}

function bareReplyIsNotATitle(reply: string): boolean {
  const text = reply.trim();
  if (text === "") return false;
  if (YES_NO.test(text)) return true;
  if (statedWarningLevel(text)) return true;
  if (datesInText(text, "2026-06-15").length > 0) return true;
  return relativeIncidentDates(text, "2026-06-15").length > 0;
}

function relativeIncidentDates(text: string, today: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return [];
  const calendar = datesInText(text, today);
  const found: string[] = [];
  for (const token of spokenDates(text, today)) {
    if (!token.iso) continue;
    if (calendar.some((item) => token.index < item.end && token.end > item.index)) continue;
    const before = text.slice(Math.max(0, token.index - 80), token.index);
    const sameClause = before.split(/[.;\n]/).pop() ?? before;
    if (PRIOR_STEP_NEAR.test(sameClause)) continue;
    found.push(token.iso);
  }
  return [...new Set(found)];
}
