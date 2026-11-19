import { isCounting, previousMonth, type GoalRow } from "./goals";

/**
 * ============================================================================
 * MONTH BY MONTH: QUALIFYING REVIEWS PER STORE, WITH L3, L6 AND YTD
 * ============================================================================
 *
 * Ported from Ask Sunny, where a manager asked to "pull the last three full
 * months so we can get a broader overall understanding and see progress", then
 * for it per month: L3, L6 and YTD.
 *
 * THE SAME RULE AS THE GOAL TABLE, MONTH BY MONTH. Each month's figure is that
 * month's `qualifyingMonthToDate` from `google_review_goal_counts_v2` — the
 * function the goal table and the leaderboard's month picker already use — so
 * the current month here is the goal table's month to date, and a past month is
 * what the leaderboard shows when that month is picked.
 *
 *   L3  = the last three FULL months (on Nov 19: Aug, Sep, Oct)
 *   L6  = the last six FULL months (on Nov 19: May – Oct)
 *   YTD = Jan 1 through today, the current partial month included
 *
 * Months shown: from whichever is earlier, January or six full months back,
 * through the current month. Pure: the read layer hands it each month's rows.
 */

export interface MonthlyStoreRow {
  storeCode: string;
  displayName: string;
  /** Qualifying reviews the store is asked for each month. */
  monthlyTarget: number;
  /** Counting toward the goal in the current month (has a baseline or a counting-since day). */
  counting: boolean;
  /** Qualifying reviews per month, in the order of `MonthlyProgress.months`. */
  months: number[];
  l3: number;
  l6: number;
  ytd: number;
}

export interface MonthlyProgress {
  /** `yyyy-mm`, oldest first, ending with the current month. */
  months: string[];
  currentMonth: string;
  l3Months: string[];
  l6Months: string[];
  ytdMonths: string[];
  rows: MonthlyStoreRow[];
}

/** `yyyy-mm` of every month the table shows, oldest first, ending with `today`'s. */
export function progressMonths(today: string): string[] {
  const current = today.slice(0, 7);
  const out = [current];
  const january = `${today.slice(0, 4)}-01`;
  // Six full months back, or January, whichever is earlier.
  while (out.length < 7 || out[out.length - 1]! > january) {
    out.push(previousMonth(out[out.length - 1]!));
  }
  return out.reverse();
}

/** Combines each month's goal rows (in `progressMonths` order) into one row per store. */
export function monthlyProgress(
  perMonth: readonly { month: string; rows: readonly GoalRow[] }[],
  today: string,
): MonthlyProgress {
  const months = perMonth.map((entry) => entry.month);
  const currentMonth = today.slice(0, 7);
  const full = months.filter((month) => month < currentMonth);
  const l3Months = full.slice(-3);
  const l6Months = full.slice(-6);
  const ytdMonths = months.filter((month) => month.startsWith(today.slice(0, 4)));

  const current = perMonth.find((entry) => entry.month === currentMonth)?.rows ?? perMonth.at(-1)?.rows ?? [];
  const rows = current.map((row): MonthlyStoreRow => {
    const counts = perMonth.map(
      (entry) => entry.rows.find((r) => r.storeCode === row.storeCode)?.qualifyingMonthToDate ?? 0,
    );
    const sum = (subset: string[]) =>
      subset.reduce((total, month) => total + counts[months.indexOf(month)]!, 0);
    return {
      storeCode: row.storeCode,
      displayName: row.displayName,
      monthlyTarget: row.monthlyTarget,
      counting: isCounting(row),
      months: counts,
      l3: sum(l3Months),
      l6: sum(l6Months),
      ytd: sum(ytdMonths),
    };
  });

  return { months, currentMonth, l3Months, l6Months, ytdMonths, rows };
}
