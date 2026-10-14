import "server-only";

import type { RankMetric } from "@/lib/google-reviews/goals";
import type { ReplyState } from "@/lib/google-reviews/reply-view";
import { loadReplyState } from "./load-replies";
import {
  PAGE_SIZE,
  parseReviewQuery,
  readGoalData,
  readMonthlyTrend,
  readReviewPage,
  readStoreSummaries,
  type GoalData,
  type MonthlyPoint,
  type ReviewPage,
  type ReviewQuery,
  type StoreSummary,
} from "@/lib/google-reviews/views";

export interface ReviewsData {
  query: ReviewQuery;
  stores: StoreSummary[];
  trend: MonthlyPoint[];
  /** Only loaded for the Reviews view. */
  page: ReviewPage | null;
  /** Reply controls for the rows on this page (absent when there is no list, or the person may not reply). */
  replies?: ReplyState | null;
  /** Goal counts; null when they cannot be read (the goal areas then say "not configured"). */
  goals: GoalData | null;
  rank: RankMetric;
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
    const rank: RankMetric = (Array.isArray(rankParam) ? rankParam[0] : rankParam) === "week" ? "week" : "month";
    const [trend, page, goals] = await Promise.all([
      readMonthlyTrend(query.store),
      withList ? readReviewPage(query) : Promise.resolve(null),
      readGoalData().catch(() => null),
    ]);
    const replies = page ? await loadReplyState(page.rows) : null;
    return { query, stores, trend, page, goals, rank, replies };
  } catch {
    return null;
  }
}

export { PAGE_SIZE };
