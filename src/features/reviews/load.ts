import "server-only";

import {
  centralToday,
  monthOf,
  previousMonth,
  type GoalTone,
  type RankMetric,
} from "@/lib/google-reviews/goals";
import {
  PAGE_SIZE,
  parseReviewQuery,
  readGoalData,
  readGoalDataForMonth,
  readPeriodTrend,
  readReviewPage,
  readStoreSummaries,
  type GoalData,
  type PeriodPoint,
  type PeriodUnit,
  type ReviewPage,
  type ReviewQuery,
  type StoreSummary,
} from "@/lib/google-reviews/views";

export interface ReviewsData {
  query: ReviewQuery;
  stores: StoreSummary[];
  /** Reviews per week or month (see `period`), by original review date. */
  trend: PeriodPoint[];
  period: PeriodUnit;
  /** Only loaded for the Reviews view. */
  page: ReviewPage | null;
  /** Goal counts; null when they cannot be read (the goal areas then say "not configured"). */
  goals: GoalData | null;
  rank: RankMetric;
  /** Search text and status chip for the goal table and leaderboard. Optional: absent means no filter. */
  goalFilter?: GoalFilter;
  /** The month the leaderboard shows (`yyyy-mm`, Central). Absent or the current month: the live month. */
  month?: string;
}

/** How many months back the leaderboard's month picker reaches. */
export const MONTHS_BACK = 12;

/** The months the picker offers, newest first, ending with the current one. */
export function monthOptions(now: Date = new Date()): string[] {
  const out = [monthOf(centralToday(now))];
  while (out.length <= MONTHS_BACK)
    out.push(previousMonth(out[out.length - 1]!));
  return out;
}

/** Never trusts a query string: anything not offered by the picker is the current month. */
export function parseMonth(
  params: Record<string, string | string[] | undefined>,
  now: Date = new Date(),
): string {
  const raw = Array.isArray(params.month) ? params.month[0] : params.month;
  const options = monthOptions(now);
  return raw && options.includes(raw) ? raw : options[0]!;
}

export interface GoalFilter {
  q: string;
  status: GoalTone | null;
}

const TONES: readonly GoalTone[] = ["met", "pace", "behind", "idle"];

/** Never trusts a query string: an unknown status is "no filter" and the search text is trimmed and capped. */
export function parseGoalFilter(
  params: Record<string, string | string[] | undefined>,
): GoalFilter {
  const one = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) ?? "";
  const status = one(params.status);
  return {
    q: one(params.q).trim().slice(0, 80),
    status: TONES.find((t) => t === status) ?? null,
  };
}

/**
 * The imported Google reviews for the dashboard, or null when there is nothing
 * to show (no reviews imported yet, or the data cannot be read) — the dashboard
 * then keeps saying "Not connected yet" rather than printing zeros.
 */
export async function loadReviewsData(
  params: Record<string, string | string[] | undefined>,
  withList: boolean,
): Promise<ReviewsData | null> {
  try {
    const query = parseReviewQuery(params);
    const stores = await readStoreSummaries();
    if (!stores.some((s) => s.reviewCount > 0)) return null;
    const rankParam = params.rank;
    const rank: RankMetric =
      (Array.isArray(rankParam) ? rankParam[0] : rankParam) === "week"
        ? "week"
        : "month";
    // The month picker belongs to the leaderboard; every other view always shows the live month.
    const month =
      params.tab === "leaderboard" ? parseMonth(params) : monthOptions()[0]!;
    const periodParam = params.period;
    const period: PeriodUnit =
      (Array.isArray(periodParam) ? periodParam[0] : periodParam) === "week"
        ? "week"
        : "month";
    const [trend, page, goals] = await Promise.all([
      readPeriodTrend(period, query.store),
      withList ? readReviewPage(query) : Promise.resolve(null),
      (month === monthOptions()[0]
        ? readGoalData()
        : readGoalDataForMonth(month)
      ).catch(() => null),
    ]);
    // Weekly is the latest year of weeks; monthly is every month held.
    return {
      query,
      stores,
      trend: period === "week" ? trend.slice(-52) : trend,
      period,
      page,
      goals,
      rank,
      goalFilter: parseGoalFilter(params),
      month,
    };
  } catch {
    return null;
  }
}

export { PAGE_SIZE };
