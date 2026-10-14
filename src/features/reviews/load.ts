import "server-only";

import {
  PAGE_SIZE,
  parseReviewQuery,
  readMonthlyTrend,
  readReviewPage,
  readStoreSummaries,
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
    const [trend, page] = await Promise.all([
      readMonthlyTrend(query.store),
      withList ? readReviewPage(query) : Promise.resolve(null),
    ]);
    return { query, stores, trend, page };
  } catch {
    return null;
  }
}

export { PAGE_SIZE };
