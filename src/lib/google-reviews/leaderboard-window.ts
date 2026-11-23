import type { GoalContext, GoalRow } from "./goals";
import type { MonthlyProgress } from "./monthly-progress";

/**
 * ============================================================================
 * THE STORE LEADERBOARD'S LONGER PERIODS: L3, L6 AND YTD
 * ============================================================================
 *
 * Ported from the sibling app (23 Nov 2026). Pau: "pls do in
 * bubbles too but pls add the per month for both like September october
 * november and make sure it syncs in the data below". Bubbles' leaderboard
 * already picks one month at a time; its Period control now also offers:
 *
 *   L3  = the last three full months, against each store's target × 3
 *   L6  = the last six full months, against target × 6
 *   YTD = Jan 1 to today, against target × the months so far this year
 *
 * The figures are the Month by month table's own L3 / L6 / YTD totals
 * (`monthly-progress.ts`), never recounted here, so the board and the table
 * agree. A window has no pace: a store has met it or it is below it.
 *
 * Pure: no database. It reshapes the current month's goal rows so the
 * leaderboard ranks, draws and filters the window through the same functions
 * as a month.
 */

export type LeaderboardWindow = "l3" | "l6" | "ytd";

export const LEADERBOARD_WINDOWS: readonly { key: LeaderboardWindow; label: string }[] = [
  { key: "l3", label: "L3 · last 3 full months" },
  { key: "l6", label: "L6 · last 6 full months" },
  { key: "ytd", label: "YTD · year to date" },
];

export function isLeaderboardWindow(value: unknown): value is LeaderboardWindow {
  return LEADERBOARD_WINDOWS.some((entry) => entry.key === value);
}

export function leaderboardWindowLabel(window: LeaderboardWindow): string {
  return LEADERBOARD_WINDOWS.find((entry) => entry.key === window)!.label;
}

/** The months a window covers, `yyyy-mm`, oldest first. */
export function windowMonths(monthly: MonthlyProgress, window: LeaderboardWindow): string[] {
  return window === "l3" ? monthly.l3Months : window === "l6" ? monthly.l6Months : monthly.ytdMonths;
}

/**
 * The goal rows for a window: each store's figure is its L3 / L6 / YTD total
 * from the Month by month table, against its monthly target × the months
 * covered. No weekly figures. The context is closed with no pace, and never
 * "partial" or "before counting": the window's figures already cover the
 * months before a store started counting (see `monthly-progress.ts`).
 */
export function windowGoalData(
  goals: { context: GoalContext; rows: GoalRow[] },
  monthly: MonthlyProgress,
  window: LeaderboardWindow,
): { context: GoalContext; rows: GoalRow[]; months: string[] } {
  const months = windowMonths(monthly, window);
  const byCode = new Map(monthly.rows.map((row) => [row.storeCode, row]));
  return {
    months,
    context: {
      ...goals.context,
      closed: true,
      window,
      monthEndInstant: undefined,
    },
    rows: goals.rows.map((row) => ({
      ...row,
      qualifyingThisWeek: 0,
      qualifyingLastWeek: 0,
      qualifyingMonthToDate: byCode.get(row.storeCode)?.[window] ?? 0,
      monthlyTarget: row.monthlyTarget * months.length,
    })),
  };
}
