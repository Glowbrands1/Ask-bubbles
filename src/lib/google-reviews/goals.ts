/**
 * GOOGLE REVIEW GOALS — the Ask Sunny rules, applied to Buff City Soap's salons.
 *
 * TEN QUALIFYING REVIEWS PER SALON PER CALENDAR MONTH. A qualifying review is a live 3-, 4- or 5-star
 * review created AFTER the salon's baseline review (counted in the database, `google_review_goal_counts`).
 * Reviews at or before the baseline are historical and never count; a salon with no baseline is
 * "not counting": it stays on screen, is never ranked and is left out of every goal total.
 *
 * Weeks run Sunday–Saturday and months run from the 1st, both in Central time, dated by Google's
 * original review time. Client-safe: no database client, no secret.
 */

import { shiftDays, weekdayOf } from "@/lib/business-date";

export const DEFAULT_MONTHLY_REVIEW_GOAL = 10;
export const REVIEWS_TIMEZONE = "America/Chicago";

const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: REVIEWS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** `yyyy-mm-dd` in Central. */
export function centralToday(now: Date = new Date()): string {
  return DAY.format(now);
}

export const weekStartOf = (day: string): string => shiftDays(day, -weekdayOf(day));
export const monthStartOf = (day: string): string => `${day.slice(0, 7)}-01`;

export function daysInMonthOf(day: string): number {
  const [year, month] = day.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** What a salon needs by the close of yesterday to finish the month on target (a pace, not an achievement). */
export function paceTargetFor(target: number, daysElapsed: number, daysInMonth: number): number {
  if (daysInMonth <= 0) return 0;
  const elapsed = Math.min(Math.max(daysElapsed, 0), daysInMonth);
  return Math.ceil((target * elapsed) / daysInMonth);
}

export interface GoalContext {
  /** `yyyy-mm-dd` of the Sunday opening this week / the week before, and the 1st, Central. */
  today: string;
  weekStart: string;
  prevWeekStart: string;
  monthStart: string;
  daysInMonth: number;
  daysElapsed: number;
}

export function goalContext(today: string): GoalContext {
  const weekStart = weekStartOf(today);
  return {
    today,
    weekStart,
    prevWeekStart: shiftDays(weekStart, -7),
    monthStart: monthStartOf(today),
    daysInMonth: daysInMonthOf(today),
    daysElapsed: Number(today.slice(8, 10)) - 1,
  };
}

/** One salon's goal row, as `google_review_goal_counts` returns it. */
export interface GoalRow {
  storeCode: string;
  displayName: string;
  monthlyTarget: number;
  baselineReviewId: string | null;
  baselineReviewTime: string | null;
  qualifyingThisWeek: number;
  qualifyingLastWeek: number;
  qualifyingMonthToDate: number;
  historical: number;
}

export type GoalStatus = "met" | "on_pace" | "behind_pace" | "partial_month" | "not_counting";

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  met: "Goal met",
  on_pace: "On pace",
  behind_pace: "Behind pace",
  partial_month: "Partial month",
  not_counting: "Not counting",
};

export const isCounting = (row: Pick<GoalRow, "baselineReviewId">): boolean => row.baselineReviewId !== null;

/** Central calendar date (`yyyy-mm-dd`) of a salon's baseline review, or null with no baseline. */
export function baselineDay(row: Pick<GoalRow, "baselineReviewTime">): string | null {
  return row.baselineReviewTime ? centralToday(new Date(row.baselineReviewTime)) : null;
}

/**
 * A baseline set during the current month means only part of the month could be counted: the figure is
 * real but it is NOT a full-month result, so it gets no pace or "behind" verdict (reaching the target still reads "Goal met").
 */
export function isPartialMonth(row: Pick<GoalRow, "baselineReviewId" | "baselineReviewTime">, context: Pick<GoalContext, "monthStart">): boolean {
  const day = baselineDay(row);
  return row.baselineReviewId !== null && day !== null && day >= context.monthStart;
}

export function goalStatus(row: GoalRow, context: GoalContext): GoalStatus {
  if (!isCounting(row)) return "not_counting";
  if (row.qualifyingMonthToDate >= row.monthlyTarget) return "met";
  if (isPartialMonth(row, context)) return "partial_month";
  const pace = paceTargetFor(row.monthlyTarget, context.daysElapsed, context.daysInMonth);
  return row.qualifyingMonthToDate >= pace ? "on_pace" : "behind_pace";
}

export interface GoalProgress {
  /** Unrounded above 100: 12 of 10 is 120. */
  percent: number;
  /** Capped at 100, for the width of a bar. */
  barPercent: number;
  remaining: number;
  over: number;
}

export function goalProgress(monthToDate: number, target: number): GoalProgress {
  const percent = target > 0 ? Math.round((monthToDate / target) * 100) : 0;
  return { percent, barPercent: Math.min(100, Math.max(0, percent)), remaining: Math.max(0, target - monthToDate), over: Math.max(0, monthToDate - target) };
}

export type RankMetric = "month" | "week";

export interface RankedRow {
  row: GoalRow;
  /** Competition rank (1, 2, 2, 4). Null for a salon that is not counting. */
  rank: number | null;
  tied: boolean;
}

/** Counting salons by the chosen figure, highest first, standard competition ranking; the rest follow unranked. */
export function rankRows(rows: readonly GoalRow[], metric: RankMetric): RankedRow[] {
  const primary = (r: GoalRow) => (metric === "month" ? r.qualifyingMonthToDate : r.qualifyingThisWeek);
  const secondary = (r: GoalRow) => (metric === "month" ? r.qualifyingThisWeek : r.qualifyingMonthToDate);
  const counting = rows
    .filter(isCounting)
    .sort((a, b) => primary(b) - primary(a) || secondary(b) - secondary(a) || a.displayName.localeCompare(b.displayName));
  const ranked = counting.map((row) => ({
    row,
    rank: 1 + counting.filter((o) => primary(o) > primary(row)).length,
    tied: counting.some((o) => o !== row && primary(o) === primary(row)),
  }));
  const rest = rows
    .filter((r) => !isCounting(r))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((row) => ({ row, rank: null, tied: false }));
  return [...ranked, ...rest];
}

export interface GoalSummary {
  counting: number;
  notCounting: number;
  qualifyingThisWeek: number;
  qualifyingLastWeek: number;
  qualifyingMonthToDate: number;
  combinedTarget: number;
  atGoal: number;
  /** Sum of each counting salon's own remainder: one salon's overage never covers another's shortfall. */
  stillNeeded: number;
  historical: number;
}

export interface PartialMonthNote {
  /** Counting salons whose baseline falls in the current month. */
  salons: number;
  /** The earliest and latest of those baseline dates, Central `yyyy-mm-dd`. */
  from: string;
  to: string;
}

/** Null when every counting salon has a full month to report. */
export function partialMonthNote(rows: readonly GoalRow[], context: Pick<GoalContext, "monthStart">): PartialMonthNote | null {
  const days = rows.filter((r) => isPartialMonth(r, context)).map((r) => baselineDay(r)!).sort();
  return days.length === 0 ? null : { salons: days.length, from: days[0]!, to: days[days.length - 1]! };
}

export function goalSummary(rows: readonly GoalRow[]): GoalSummary {
  const counting = rows.filter(isCounting);
  const total = (pick: (r: GoalRow) => number) => counting.reduce((a, r) => a + pick(r), 0);
  return {
    counting: counting.length,
    notCounting: rows.length - counting.length,
    qualifyingThisWeek: total((r) => r.qualifyingThisWeek),
    qualifyingLastWeek: total((r) => r.qualifyingLastWeek),
    qualifyingMonthToDate: total((r) => r.qualifyingMonthToDate),
    combinedTarget: total((r) => r.monthlyTarget),
    atGoal: counting.filter((r) => r.qualifyingMonthToDate >= r.monthlyTarget).length,
    stillNeeded: total((r) => goalProgress(r.qualifyingMonthToDate, r.monthlyTarget).remaining),
    historical: rows.reduce((a, r) => a + r.historical, 0),
  };
}
