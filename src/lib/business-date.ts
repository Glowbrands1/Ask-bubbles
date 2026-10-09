/**
 * WHICH "TODAY" THE BUSINESS IS IN.
 *
 * ============================================================================
 * IT LIVES HERE, NOT UNDER `forms/`, BECAUSE THREE THINGS NOW ASK
 * ============================================================================
 *
 * It was written for follow-up dates and sat in `lib/forms/`. Two more callers
 * have since needed the same answer — the Overview page, and now the reporting
 * layer, which has to say how far behind today a report's newest figures are.
 *
 * A shared concern under one feature's folder is an invitation to duplicate the
 * constant rather than reach across, and a SECOND business timezone is the
 * worst possible outcome here: two parts of one product would disagree about
 * what day it is, and both would be internally consistent. So it moved, and the
 * three callers import it from one place.
 *
 * ============================================================================
 * WHY NOT UTC, AND WHY NOT THE HOST
 * ============================================================================
 *
 * Two of the app's existing date conventions are both right and neither is
 * usable here:
 *
 *   `src/lib/utils/date.ts` measures everything against DEMO_ANCHOR, a fixed
 *   instant, so the prototype's relative text ("in 3 days") is identical on the
 *   server and in the browser and identical at every presentation. Follow-ups
 *   are real persisted records with real dates, so measuring them against a
 *   frozen August anchor would call a form due next week "overdue" for as long
 *   as the anchor stayed put. Nothing here touches DEMO_ANCHOR.
 *
 *   The reporting layer keeps ISO dates in UTC and infers no zone at all, which
 *   is correct for a workbook: a period is a label, not a moment. A follow-up
 *   IS a moment — "is this late?" is asked at a location, in the morning, in the
 *   United States — so UTC is the wrong ruler. At 8pm Eastern the UTC date has
 *   already rolled over, and a form due tomorrow would show as overdue that
 *   evening. That is precisely the failure this module prevents.
 *
 * So: one business timezone, one business date, computed from the real clock.
 *
 * THE ZONE IS EXPLICIT AND OVERRIDABLE. It is not read from the host, because
 * the host is a container in some region and has nothing to do with where the
 * locations are. `NEXT_PUBLIC_` so the same value is available on both sides of
 * the render and the server and the browser can never disagree about what day
 * it is.
 *
 * The default is US Central (owner's instruction, 9 Oct 2026: "it should
 * always be in CT"). The locations span US time zones, so no single choice is
 * exactly local everywhere; what matters is that it is a BUSINESS zone rather
 * than UTC, and that it is one value everything agrees on. A location an hour
 * east or west sees a form become overdue an hour from its own midnight, which
 * is an hour of skew instead of five or six.
 */

/**
 * The zone every business date is judged in. Override per deployment.
 *
 * THE CONFIGURATION SEAM. One environment variable, one default, one module —
 * so a deployment that operates in a different zone changes a value rather
 * than a code path, and nothing anywhere else needs to know.
 */
export const BUSINESS_TIMEZONE =
  process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE?.trim() || "America/Chicago";

/**
 * The business date as ISO `yyyy-mm-dd`.
 *
 * `en-CA` is not decoration: that locale formats as `2026-09-04`, which is the
 * ISO order, so no month/day reassembly is needed and no ambiguity can creep
 * in. `Intl` does the zone conversion, which is the only thing in the platform
 * that knows when daylight saving moved.
 */
export function businessToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The hour of the day, 0-23, in the business zone.
 *
 * FOR GREETINGS AND NOTHING ELSE, so far. The Overview said "Good morning" at
 * six in the evening because it took the hour from `demoNow()` — the frozen
 * prototype clock — and then read it as UTC on top. Both halves were wrong in
 * live mode, and a landing page that opens with the wrong time of day is the
 * first thing a manager notices.
 *
 * `hourCycle: "h23"` is what keeps midnight 0 rather than 24: `hour12: false`
 * alone still formats midnight as "24" in several locales, which would make it
 * later than any evening rather than earlier than any morning.
 */
export function businessHour(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: BUSINESS_TIMEZONE,
      hour: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }).format(now),
  );
}

/**
 * Days between two ISO dates. Negative when `date` is before `from`.
 *
 * TAKES CALENDAR DATES, NOT INSTANTS, and that is what makes it safe to use for
 * a freshness lag as well as a follow-up. Both sides are already business-zone
 * calendar dates by the time they reach here — one from `businessToday`, the
 * other from a report's own period end, which is a label the workbook wrote and
 * carries no zone at all. Comparing them at UTC midnight is therefore whole
 * days with no daylight-saving arithmetic to get wrong.
 */
export function daysBetween(from: string, date: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  // Both are UTC midnights of calendar dates, so this is whole days with no
  // daylight-saving arithmetic to get wrong.
  return Math.round((b - a) / 86_400_000);
}

/** Which day of the week an ISO date falls on, 0 = Sunday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** An ISO date shifted by whole days. */
export function shiftDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * The instant a business day begins: midnight of `date` in the business zone.
 *
 * FOR QUERYING TIMESTAMPS BY BUSINESS DAY. A stored `timestamptz` is an
 * instant, and "everything on 9 October" in Central Time is the instants from
 * 9 October 00:00 CDT (05:00 UTC) up to 10 October 00:00 CDT — not from UTC
 * midnight, which is 7pm the evening before in summer and 6pm in winter. A
 * window bounded at UTC midnight drops every evening rating after 7pm into the
 * next day, which is exactly what the Conversation Feedback panel did.
 *
 * DAYLIGHT SAVING IS INTL'S PROBLEM, NOT ARITHMETIC'S. The zone's offset is
 * read at a first guess and then again at the corrected instant, because the
 * offset at UTC midnight and at local midnight differ on a changeover date.
 * Two passes settle it in every zone whose transitions are not at midnight,
 * which includes every US zone (they change at 2am). A zone that springs
 * forward AT midnight has no local midnight on that one day; it is not a
 * business zone this product supports.
 */
export function businessDayStart(date: string, timeZone: string = BUSINESS_TIMEZONE): Date {
  const utcMidnight = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(utcMidnight)) return new Date(Number.NaN);
  let instant = utcMidnight - zoneOffsetMs(utcMidnight, timeZone);
  instant = utcMidnight - zoneOffsetMs(instant, timeZone);
  return new Date(instant);
}

/** The zone's offset from UTC at `instant`, in ms (Central: -5h or -6h). */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
  return asIfUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The last day of the business week containing `date`.
 *
 * SUNDAY TO SATURDAY, the US retail week — the one location schedules and weekly
 * review numbers are already read in. It matters for exactly one thing: what
 * "due this week" means on the Overview. On a Thursday it reaches to Saturday;
 * on a Saturday "this week" is today, and next Monday's follow-up is next
 * week's problem rather than being quietly folded into today's count.
 */
export function businessWeekEnd(date: string): string {
  return shiftDays(date, 6 - weekdayOf(date));
}
