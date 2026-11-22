import type { CardRecord } from "./card-record";
import { monthDayToIso, readDates } from "./dates";

/**
 * PRIOR-STEP DATES (QA's Bubbles round 3, 22 Nov 2026, U21): a date the manager gave for an earlier step (a coaching, a
 * signed policy) is never the day this happened. The tester's card took 9/22 (the earlier coaching, typed "recieved
 * coaching on 9/22") and later 6/24/24 (the day the policies were signed) as its form date. The steps are read from
 * what the cards recorded, not from words: this turn's prior_actions, the steps read from the manager's words, and the
 * prior actions' dates this person's earlier cards held (their server record, `CardRecord.priorDates`; a later turn's
 * prior_actions may leave a step out). Shared with the Observation's prior-step pass (U21).
 */

/** Each date the lines hold, as a card's ISO date: the year as written, else the latest such day not after today. */
export function priorStepDates(lines: readonly (string | null | undefined)[], today: string): Map<string, string> {
  const dates = new Map<string, string>();
  for (const line of lines) {
    if (!line) continue;
    for (const read of readDates(line)) {
      const iso = read.year
        ? `${read.year}-${String(read.month).padStart(2, "0")}-${String(read.day).padStart(2, "0")}`
        : monthDayToIso(`${read.month}/${read.day}`, today);
      if (!dates.has(iso)) dates.set(iso, line.slice(0, 160));
    }
  }
  return dates;
}

/** The prior actions' dates (ISO) this person's earlier cards in the chat held, oldest first, each once. */
export function earlierPriorDates(records: readonly (CardRecord | null | undefined)[], isThisPerson: (record: CardRecord) => boolean): string[] {
  const dates = records.filter((record): record is CardRecord => Boolean(record && isThisPerson(record))).flatMap((record) => record.priorDates ?? []);
  return [...new Set(dates)];
}

/** An ISO date as a line `incidentDates` and `priorStepDates` read back ("9/22/2026"). */
export function priorDateLine(iso: string): string {
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}`;
}
