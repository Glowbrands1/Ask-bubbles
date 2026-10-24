import { formReplayGuardsEnabled, formStateEnabled, slotRetentionEnabled } from "@/lib/config/chat-quality-flags";

import { datesInText } from "./form-date-answer";
import { incidentDates } from "./incident-dates";
import { askedForPosition, readPositionAnswer } from "./employee-position";
import { payrollDeductAmount } from "./payroll-deduct";
import { statedJobTitle } from "./proposal";
import { spokenDates } from "./relative-date";
import { statedWarningLevel } from "./warning-level";

/**
 * Incident date, payroll amount, and a follow-up that is not a job title.
 *
 * Off, each helper returns the value the caller already had. On, one
 * incident day the manager gave — including "yesterday" — is the form date
 * instead of today. A dollar amount in the same clause as a payroll
 * deduction is that amount. "verbal", "yes", and a store change are not a
 * job title.
 */

const PRIOR_STEP_NEAR =
  /\b(?:previous(?:ly)?|prior|already|coached|coaching|warned|warning|write[- ]?ups?|corrective action)\b/i;

const YES_NO = /^(?:yes|no|yeah|yep|nope|ok|okay)[\s.!]*$/i;

const POLICY_QUOTE = /\$25\.00\s+via\s+payroll\s+deduction/i;

type Turn = { readonly role: string; readonly content: string };

function titleGuardOn(): boolean {
  return formReplayGuardsEnabled() || slotRetentionEnabled() || formStateEnabled();
}

/** A one-word or short reply that answers a different field. */
export function replyIsNotAJobTitle(reply: string): boolean {
  const text = reply.trim();
  if (text === "") return false;
  if (YES_NO.test(text)) return true;
  if (/\bchange store to\b/i.test(text)) return true;
  if (statedWarningLevel(text)) return true;
  if (datesInText(text, "2026-06-15").length > 0) return true;
  return spokenDates(text, "2026-06-15").some((token) => token.iso !== null);
}

/**
 * The job title for the card. With the title guard off this is
 * `statedJobTitle ?? positionAnsweredIn`. On, a bare warning, date, yes/no,
 * or store change is not the title.
 */
export function replayJobTitle(text: string, conversation: readonly Turn[]): string | null {
  const company = statedJobTitle(text);
  if (!titleGuardOn()) {
    return company ?? positionFromAnswers(conversation, false);
  }
  if (company) return company;
  return positionFromAnswers(conversation, true);
}

function positionFromAnswers(conversation: readonly Turn[], skipOtherFields: boolean): string | null {
  let answer: string | null = null;
  for (let index = 1; index < conversation.length; index += 1) {
    const turn = conversation[index]!;
    const before = conversation[index - 1]!;
    if (turn.role !== "user" || before.role !== "assistant" || !askedForPosition(before.content)) continue;
    if (skipOtherFields && replyIsNotAJobTitle(turn.content)) continue;
    const read = readPositionAnswer(turn.content);
    if (read) answer = read;
  }
  return answer;
}

/**
 * One relative incident day ("yesterday"), or null. A calendar incident
 * date is left to `extractFormDate`. "today" stays today.
 */
export function replayIncidentDate(text: string, today: string): string | null {
  if (!formReplayGuardsEnabled()) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  if (incidentDates(text, today).length > 0) return null;
  const calendar = datesInText(text, today);
  const found: string[] = [];
  for (const token of spokenDates(text, today)) {
    if (!token.iso || token.iso === today) continue;
    if (calendar.some((item) => token.index < item.end && token.end > item.index)) continue;
    const before = text.slice(Math.max(0, token.index - 80), token.index);
    const sameClause = before.split(/[.;\n]/).pop() ?? before;
    if (PRIOR_STEP_NEAR.test(sameClause)) continue;
    found.push(token.iso);
  }
  const unique = [...new Set(found)];
  return unique.length === 1 ? unique[0]! : null;
}

/**
 * The form date. Off, `current` is returned. On, one incident day replaces
 * a missing date or today's date. Several incident days are left alone.
 */
export function replayFormDate(text: string, today: string, current: string | null | undefined): string | null {
  if (!formReplayGuardsEnabled()) return current ?? null;
  const incidents = incidentDates(text, today);
  if (incidents.length > 1) return current ?? null;
  if (incidents.length === 1) {
    if (!current || current === today) return incidents[0]!;
    return current;
  }
  const relative = replayIncidentDate(text, today);
  if (relative && (!current || current === today)) return relative;
  return current ?? null;
}

function dollars(written: string): string {
  const compact = written.replace(/\s+/g, "");
  return compact.startsWith("$") ? compact : `$${compact}`;
}

/**
 * The payroll amount. Off, this is `payrollDeductAmount`. On, a dollar
 * figure in the same clause as a deduction counts too. The manual's
 * "$25.00 via payroll deduction" does not.
 */
export function replayPayrollAmount(text: string): string | null {
  const stated = payrollDeductAmount(text);
  if (!formReplayGuardsEnabled()) return stated;
  if (stated) return stated;
  let found: string | null = null;
  for (const clause of text.split(/[.;\n]|\s+but\s+/i)) {
    if (POLICY_QUOTE.test(clause)) continue;
    if (!/\bpayroll\b|\bdeduct/i.test(clause)) continue;
    const amounts = [...clause.matchAll(/\$\s?(\d+(?:,\d{3})*(?:\.\d{2})?)/g)];
    const last = amounts.at(-1);
    if (!last) continue;
    const amount = dollars(last[0]!);
    if (Number(amount.replace(/[$,]/g, "")) === 0) continue;
    found = amount;
  }
  return found;
}

/** True when two titles are the same words. */
export function sameTitleWords(title: string, reply: string): boolean {
  const fold = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return fold(title) === fold(reply);
}
