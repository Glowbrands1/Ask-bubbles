import { shiftDays } from "@/lib/business-date";

import { centralToday } from "./goals";

/**
 * L3, L6 AND YTD: ONE-CLICK DATE RANGES FOR THE REVIEWS LIST.
 *
 * The Reviews view already filters by a From/To pair of Central days; these are
 * presets for it, so a manager can pull a broader window than this week or the
 * month to date without typing dates.
 *
 * L3 and L6 are the last three / six FULL calendar months — on Nov 19, L3 is
 * Aug 1 – Oct 31 and L6 is May 1 – Oct 31; the current, partial month is in
 * neither. YTD is Jan 1 up to and including today.
 *
 * Pure and client-safe: no database, no secret.
 */
export type QuickRangeKey = "l3" | "l6" | "ytd";

export interface QuickRange {
  key: QuickRangeKey;
  /** Short label for the button, "L3". */
  label: string;
  /** What it means, for the title / screen reader. */
  description: string;
  /** Inclusive Central days. */
  from: string;
  to: string;
}

/** The 1st of the month `count` months before the one `day` is in. */
function monthsBackStart(day: string, count: number): string {
  const index = Number(day.slice(0, 4)) * 12 + (Number(day.slice(5, 7)) - 1) - count;
  const year = Math.floor(index / 12);
  return `${year}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

/** The inclusive From/To days of the last `count` full calendar months before `today`'s. */
export function lastFullMonths(count: number, today: string): { from: string; to: string } {
  return {
    from: monthsBackStart(today, count),
    to: shiftDays(`${today.slice(0, 7)}-01`, -1),
  };
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const monthLabel = (day: string) => MONTH.format(new Date(`${day}T00:00:00Z`));

export function quickRanges(now: Date = new Date()): QuickRange[] {
  const today = centralToday(now);
  const l3 = lastFullMonths(3, today);
  const l6 = lastFullMonths(6, today);
  return [
    { key: "l3", label: "L3", description: `Last 3 full months (${monthLabel(l3.from)} – ${monthLabel(l3.to)})`, ...l3 },
    { key: "l6", label: "L6", description: `Last 6 full months (${monthLabel(l6.from)} – ${monthLabel(l6.to)})`, ...l6 },
    { key: "ytd", label: "YTD", description: `Year to date (since Jan 1, ${today.slice(0, 4)})`, from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
}
