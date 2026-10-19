export const REVIEW_TABS = [
  { key: "overview", label: "Overview" },
  { key: "reviews", label: "Google Reviews" },
  { key: "leaderboard", label: "Store Leaderboard" },
] as const;

export type ReviewsTab = (typeof REVIEW_TABS)[number]["key"];

export const DEFAULT_REVIEWS_TAB: ReviewsTab = "overview";

/** A tab name nobody published lands on the default view, not on an error. */
export function parseReviewsTab(
  raw: string | string[] | undefined,
): ReviewsTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (
    REVIEW_TABS.find((entry) => entry.key === value)?.key ?? DEFAULT_REVIEWS_TAB
  );
}

export function reviewsTabHref(tab: ReviewsTab): string {
  return tab === DEFAULT_REVIEWS_TAB ? "/reviews" : `/reviews?tab=${tab}`;
}
