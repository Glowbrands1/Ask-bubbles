import {
  failureToOpenIsLateOpeningEnabled,
  formDateIncidentOnlyEnabled,
  lateOpenDateEnabled,
  noShowOpeningIsAttendanceEnabled,
} from "@/lib/config/chat-quality-flags";

import { listIncidentDates } from "./form-date-answer";
import { incidentOnly } from "./form-date-incident-only";

/**
 * ============================================================================
 * A LATE OPENING, AND THE DATE IT HAPPENED (QA, 24 OCT 2026)
 * ============================================================================
 *
 * "late to open 10-19, verbal, no payroll" came back with no date and the
 * Attendance section. Two readers missed it:
 *
 *   THE DATE. The shared date reader needs a year on a dashed date, because
 *   "10-12" alone is more often a range ("10-12 hours"). After a date cue —
 *   "on", "dated", "the date is / to", "change … to", "late to open" — a
 *   yearless "10-19" is a month and day. It is the most recent 19 October on
 *   or before today, never a future one.
 *
 *   THE POLICY. "late to open" is the manual's Late Opening section, as
 *   "late opening" and "opened late" already were. "Late for her shift" is
 *   still Attendance.
 *
 * Used by the callers only (`intent-slots.ts`, `intake-augment.ts`,
 * `form-full-remap.ts`, `official-policy-manual.ts`, `ca-policy.ts`), behind
 * LATE_OPEN_DATE_ENABLED. The protected date and payroll readers are not
 * changed. Pure and browser-safe. Ported from the sibling app.
 */

/** "late to open", "was late to open the store". */
export const LATE_TO_OPEN = /\blate\s+to\s+open\b/i;

/*
 * FAILURE_TO_OPEN_IS_LATE_OPENING_ENABLED (ported from the sibling app, 10 Nov 2026): "a CA for <name> for failure to
 * open on time" is a late opening. "failure / failed / failing to open" (not "open the form", "the drawer", "the
 * register" …), and "did not / didn't / couldn't open" with "on time" or the store. Read lower-cased.
 */
const NOT_THE_STORE =
  /(?!\s+(?:(?:a|an|the|this|that|her|his|my|their|our|up)\s+)?(?:forms?|drafts?|cards?|files?|ca|c\/a|corrective|coaching|documents?|app|apps|e-?mails?|messages?|tickets?|accounts?|registers?|drawers?|tills?|safes?|boxe?s?|packages?|doors?\s+for)\b)/;
export const FAILURE_TO_OPEN = new RegExp(
  String.raw`\bfail(?:ed|ure|ing|s)?\s+to\s+open${NOT_THE_STORE.source}\b` +
    String.raw`|\b(?:did\s*n['’]?t|did\s+not|didnt|never|could\s*n['’]?t|could\s+not|unable\s+to|(?:was|were)\s*n['’]?t\s+able\s+to|(?:was|were)\s+not\s+able\s+to)\s+open\s+(?:(?:the\s+)?(?:store|location|shop|makery)\s+)?(?:on|in)\s+time\b` +
    String.raw`|\b(?:did\s*n['’]?t|did\s+not|didnt|never)\s+open\s+(?:the\s+|her\s+|his\s+)?(?:store|location|shop|makery)\b`,
  "i",
);

/** FAILURE_TO_OPEN_IS_LATE_OPENING_ENABLED: whether the words say the employee failed to open. Off, false. */
export function saysFailureToOpen(text: string): boolean {
  return failureToOpenIsLateOpeningEnabled() && FAILURE_TO_OPEN.test(text);
}

/*
 * LATE_OPENING_OWN_WORDS_ENABLED (QA's live Bubbles round 17b, 10 Nov 2026): the words the manager typed that read as
 * a late opening, for the card's 'from what you described ("…")'. It used to be the app's own "opening late", which
 * the manager never said ("did not show up for a scheduled opening shift", "failure to open on time"). The span is
 * taken from the text as typed, with "on time" / "late" after it when they follow.
 */
const OWN_LATE_OPENING = [
  FAILURE_TO_OPEN,
  /\blate\s+to\s+open(?:\s+(?:the\s+)?(?:store|location|shop|makery))?\b/i,
  /\bopen(?:ed|ing)?\s+(?:(?:the|our|her|his|their)\s+)?(?:store|location|shop|makery|doors)\s+late\b/i,
  /\bopen(?:ed|ing)\s+late\b/i,
  /\blate[- ]open(?:ing|ed)?\b/i,
  /\b(?:(?:scheduled|assigned)\s+)?opening\s+shift\b/i,
  /\b(?:scheduled|supposed|assigned|due)\s+to\s+open\b/i,
  /\bopen(?:ed|ing)?\s+(?:(?:the|our|her|his|their)\s+)?(?:store|location|shop|makery|doors)\b/i,
  /\bopener\b/i,
];
/** A late tail, kept with the match: "late", "40 minutes late", "an hour late". */
const LATE_TAIL = /^\s+(?:(?:\d+|an?|one|two|three|half\s+an?)\s+(?:min(?:ute)?s?|hours?|hrs?)\s+)?late\b/i;
/** "on time" is kept only after a negation the quote carries ("not opening the store on time"), never on its own. */
const ON_TIME_TAIL = /^\s+on\s+time\b/i;
/**
 * QA's Gate-Bubbles-2 (10 Nov 2026), nov6-reopen-write-up-still-creates: "for not opening the store on time" was quoted
 * "opening the store on time", the meaning reversed. A negation right before the match is part of the quote.
 */
const NEGATION_BEFORE = /\b(?:not|never|did\s*n['’]?t|did\s+not|didnt|failed\s+to|failure\s+to|was\s*n['’]?t|was\s+not)\s+$/i;

/** LATE_OPENING_OWN_WORDS_ENABLED: the manager's own words that read as a late opening, as typed, or null. */
export function lateOpeningWords(text: string): string | null {
  const said = text ?? "";
  for (const pattern of OWN_LATE_OPENING) {
    const found = pattern.exec(said);
    if (!found) continue;
    const negation = NEGATION_BEFORE.exec(said.slice(Math.max(0, found.index - 20), found.index))?.[0] ?? "";
    const negated = negation !== "" || /^fail/i.test(found[0]);
    const end = found.index + found[0].length;
    const rest = said.slice(end);
    const tail = LATE_TAIL.exec(rest)?.[0] ?? (negated ? (ON_TIME_TAIL.exec(rest)?.[0] ?? "") : "");
    return `${negation}${found[0]}${tail}`.replace(/\s+/g, " ").trim();
  }
  return null;
}

/*
 * NO_SHOW_OPENING_IS_ATTENDANCE_ENABLED (QA's ruling on round 17b, 10 Nov 2026): "did not show up for a scheduled
 * opening shift" is an absence (Attendance), as Pau's missed-shift ruling has it, never a Late Opening. A Late Opening
 * is the store opening late: "failure to open on time", "opened late", "late to open". The words say the employee did
 * not come, and nothing says the store opened late.
 */
const NO_SHOW =
  /\b(?:did\s*n['’]?t\s+show(?:\s+up)?|did\s+not\s+show(?:\s+up)?|didnt\s+show(?:\s+up)?|never\s+show(?:ed)?(?:\s+up)?|no[- ]?show(?:ed)?|no[- ]call|did\s*n['’]?t\s+come\s+in|did\s+not\s+come\s+in|missed\s+(?:her|his|their|a|the)\s+(?:scheduled\s+)?(?:opening\s+)?shift)\b/i;
const STORE_OPENED_LATE =
  /\b(?:late[- ]open(?:ing|ed)?|open(?:ed|ing)?\s+(?:(?:the|our|her|his|their)\s+)?(?:store|location|shop|makery|doors)\s+late|open(?:ed|ing)\s+late|late\s+to\s+open)\b/i;

/** NO_SHOW_OPENING_IS_ATTENDANCE_ENABLED: the manager's own words for the no-show, as typed ("did not show up for a scheduled opening shift"), or null. */
export function noShowWords(text: string): string | null {
  if (!noShowNotLateOpening(text)) return null;
  const said = text ?? "";
  const found = NO_SHOW.exec(said);
  if (!found) return null;
  const tail = /^\s+(?:for|to)\s+(?:(?:her|his|their|a|the)\s+)?(?:scheduled\s+)?(?:opening\s+)?shift\b/i.exec(said.slice(found.index + found[0].length))?.[0] ?? "";
  return `${found[0]}${tail}`.replace(/\s+/g, " ").trim();
}

/** NO_SHOW_OPENING_IS_ATTENDANCE_ENABLED: the employee did not come to (an opening) shift, and the store's late opening is not said. Off, false. */
export function noShowNotLateOpening(text: string): boolean {
  return (
    noShowOpeningIsAttendanceEnabled() &&
    NO_SHOW.test(text) &&
    !STORE_OPENED_LATE.test(text) &&
    !FAILURE_TO_OPEN.test(text)
  );
}

/**
 * An account that is also about a shift or an absence, which the Attendance
 * section governs whatever else happened.
 */
const ATTENDANCE_TOO =
  /\b(?:late\s+(?:to|for)\s+(?:(?:her|his|their|a|the|my|your)\s+)?shift|tardy|tardiness|absent|absence|absences|absenteeism|no[- ]call|no[- ]show|called\s+(?:out|off)|call[- ]?off|missed\s+(?:her|his|their|a|the)\s+shift|left\s+early|leaving\s+early|clocked\s+out\s+early)\b/i;

/** Whether the account describes something the Attendance section governs beside a late opening. */
export function describesAttendanceToo(text: string): boolean {
  return ATTENDANCE_TOO.test(text ?? "");
}

/** A month-day with no year, not part of a longer date or number. "10-19", not "10-19-26". */
const YEARLESS_DASHED = /(?<![\d/.-])(\d{1,2})-(\d{1,2})(?![\d/-]|\.\d)/g;

/** Words just before the date that make it one. */
const DATE_CUE_BEFORE = new RegExp(
  String.raw`(?:\bon|\bdated?|\bdate\s+(?:is|was|to|as|of|should\s+be|will\s+be)|\bchange(?:d)?\b[^.\n]{0,40}?\bto|\bmake\s+(?:it|the\s+date)|\blate\s+to\s+open(?:\s+(?:the\s+)?(?:store|location|shop|makery))?|\blate[- ]open(?:ing|ed)?|\bopen(?:ed|ing)?(?:\s+(?:the\s+)?(?:store|location|shop|makery))?\s+late)\s*[:,]?\s*$`,
  "i",
);

/** Words just after it that make it a range: "10-12 hours", "5-10 min". */
const RANGE_AFTER = /^\s*(?:min|mins|minutes|hrs?|hours?|days?|weeks?|months?|years?|people|times|x\b|%|am\b|pm\b|dollars?)/i;

function isoOf(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1) return null;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > days) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The most recent `month`-`day` on or before `today`. */
export function mostRecent(month: number, day: number, today: string): string | null {
  const year = Number(/^(\d{4})-/.exec(today)?.[1]);
  if (!Number.isFinite(year)) return null;
  const thisYear = isoOf(year, month, day);
  if (thisYear && thisYear <= today) return thisYear;
  return isoOf(year - 1, month, day);
}

export interface YearlessDate {
  readonly iso: string;
  readonly index: number;
  readonly end: number;
}

/** Every yearless dashed month-day in the text that follows a date cue, in order. */
export function yearlessCuedDates(text: string, today: string): YearlessDate[] {
  const found: YearlessDate[] = [];
  const source = text ?? "";
  for (const match of source.matchAll(YEARLESS_DASHED)) {
    const index = match.index ?? 0;
    const end = index + match[0].length;
    /*
     * FORM_DATE_INCIDENT_ONLY_ENABLED (QA, 26 Oct 2026, live tester finding):
     * "late on 10-5 and 10-15" — the second date continues the cued list and
     * is a date too, or the form took the first one alone.
     */
    const previous = found[found.length - 1];
    const continuesList =
      formDateIncidentOnlyEnabled() &&
      previous !== undefined &&
      index - previous.end <= 8 &&
      /^\s*(?:,|and|&|or|,\s*and)\s*$/i.test(source.slice(previous.end, index));
    if (!continuesList && !DATE_CUE_BEFORE.test(source.slice(Math.max(0, index - 60), index))) continue;
    if (RANGE_AFTER.test(source.slice(end, end + 12))) continue;
    const iso = mostRecent(Number(match[1]), Number(match[2]), today);
    if (iso) found.push({ iso, index, end });
  }
  return found;
}

function slashed(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}

/** The same text with each cued yearless "10-19" written "10/19/2026", a shape the date readers accept. */
export function withYearlessDatesWritten(text: string, today: string): string {
  const dates = yearlessCuedDates(text, today);
  if (dates.length === 0) return text;
  let out = "";
  let at = 0;
  for (const date of dates) {
    out += text.slice(at, date.index) + slashed(date.iso);
    at = date.end;
  }
  return out + text.slice(at);
}

/**
 * The one incident date THIS turn states, yearless ones included, or null.
 * The newest date the manager gives dates the form ahead of one saved from
 * an earlier turn: "change the date to 10-22" after "late to open 10-19".
 * `read` is the caller's own reader of the turn's dates.
 */
export function newestStatedDate(
  question: string,
  today: string,
  read: (text: string, today: string) => string | null = singleIncidentDate,
): string | null {
  return read(withYearlessDatesWritten(question, today), today);
}

function singleIncidentDate(text: string, today: string): string | null {
  const dates = [...new Set(incidentOnly(text, today, listIncidentDates(text, today)).map((found) => found.iso))];
  return dates.length === 1 ? dates[0]! : null;
}

/** Whether LATE_OPEN_DATE_ENABLED is on. One import for the callers. */
export function lateOpenOn(): boolean {
  return lateOpenDateEnabled();
}
