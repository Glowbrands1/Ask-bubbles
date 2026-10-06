import { shiftDays, weekdayOf } from "@/lib/business-date";

import { datesInText } from "./form-date-answer";

/**
 * ============================================================================
 * "YESTERDAY", "LAST FRIDAY" — DATES AS MANAGERS SAY THEM
 * ============================================================================
 *
 * Ported from the reference platform's exit-form reader (`dateTokens` in its
 * `exit-facts.ts`), where it was written for "her last day was yesterday". The
 * reading itself names no form, so it lives here and any caller that needs a
 * spoken date can use it.
 *
 * `datesInText` stays the one reader of CALENDAR dates ("9/27", "Sept 27");
 * this adds the relative ones on top of it rather than a second calendar
 * reader, so "9/11" cannot mean one thing here and another there.
 *
 * RELATIVE TO THE BUSINESS DAY, never the host's clock, so "yesterday" is the
 * same day to every reader in a turn. A bare weekday — "Friday", "on Friday"
 * — is kept with no date: it says a date was meant and not which, and the
 * caller must ask rather than pick a week.
 */

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY = WEEKDAYS.join("|");

export interface SpokenDate {
  /** Null for a weekday that names no particular week. */
  readonly iso: string | null;
  readonly phrase: string;
  readonly index: number;
  readonly end: number;
}

/** Every date in `text`, calendar and relative, in reading order. */
export function spokenDates(text: string, today: string): SpokenDate[] {
  const tokens: SpokenDate[] = datesInText(text, today).map((found) => ({
    iso: found.iso,
    phrase: text.slice(found.index, found.end),
    index: found.index,
    end: found.end,
  }));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return tokens;

  const add = (pattern: RegExp, resolve: (match: RegExpMatchArray) => string | null) => {
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0;
      const end = index + match[0].length;
      if (tokens.some((token) => index < token.end && end > token.index)) continue;
      tokens.push({ iso: resolve(match), phrase: match[0], index, end });
    }
  };

  // "today", "today's" and the "todays date" managers actually type.
  add(/\btoday(?:'?s)?(?:\s+date)?\b/gi, () => today);
  add(/\byesterday\b/gi, () => shiftDays(today, -1));
  add(/\btomorrow\b/gi, () => shiftDays(today, 1));
  add(new RegExp(String.raw`\b(?:last|this past|past)\s+(${WEEKDAY})\b`, "gi"), (match) => {
    const target = WEEKDAYS.indexOf(match[1]!.toLowerCase());
    const back = ((weekdayOf(today) - target + 7) % 7) || 7;
    return shiftDays(today, -back);
  });
  add(new RegExp(String.raw`\bnext\s+(${WEEKDAY})\b`, "gi"), (match) => {
    const target = WEEKDAYS.indexOf(match[1]!.toLowerCase());
    const ahead = ((target - weekdayOf(today) + 7) % 7) || 7;
    return shiftDays(today, ahead);
  });
  add(new RegExp(String.raw`\b(?:this\s+|on\s+)?(?:${WEEKDAY})\b`, "gi"), () => null);

  /*
   * "FRIDAY, SEPTEMBER 12" IS ONE DATE. A weekday written beside a calendar
   * date is that date's label, not a second, unplaceable one.
   */
  const sorted = tokens.sort((left, right) => left.index - right.index);
  const merged: SpokenDate[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const token = sorted[i]!;
    const next = sorted[i + 1];
    if (token.iso === null && next?.iso && /^[\s,]*(?:the\s+)?$/.test(text.slice(token.end, next.index))) {
      merged.push({ ...next, index: token.index, phrase: text.slice(token.index, next.end) });
      i += 1;
      continue;
    }
    merged.push(token);
  }
  return merged;
}

/**
 * The one date `text` names, or null when it names none, only an unplaceable
 * weekday, or more than one different day. Never a choice between two.
 */
export function singleSpokenDate(text: string, today: string): string | null {
  const dates = spokenDates(text, today);
  if (dates.some((date) => date.iso === null)) return null;
  const distinct = [...new Set(dates.map((date) => date.iso))];
  return distinct.length === 1 ? distinct[0]! : null;
}
