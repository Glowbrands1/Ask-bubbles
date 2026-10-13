/**
 * ============================================================================
 * GOOGLE REVIEWS DASHBOARD — INTEGRATION STATUS
 * ============================================================================
 *
 * THIS PAGE IS A LAYOUT, NOT A DATA SOURCE. Ask Bubbles has no Google Reviews
 * feed connected to this dashboard, so every data area asks one question — is
 * the integration connected? — and says "Not connected yet" when it is not.
 *
 * AN UNCONNECTED INTEGRATION IS NOT A CONNECTED ONE WITH ZERO REVIEWS. "0 / 10"
 * and "0%" are measurements; they claim Google was asked and answered. Nothing
 * here prints a figure, a name, a rank or a bar until a real read supplies it.
 *
 * TO CONNECT REAL DATA LATER: make `resolveReviewsIntegrationStatus` return
 * "connected" once a tenant-scoped Ask Bubbles source exists, and pass the
 * loaded snapshot as the children of the `DataArea` that should show it. The
 * tabs, tiles, tables and filters need no rebuilding.
 */
export type ReviewsIntegrationStatus = "not_connected" | "connected";

export const NOT_CONNECTED_MESSAGE = "Not connected yet";

/**
 * The one place the status is decided. It deliberately reads nothing: no
 * database, no API, no environment variable — so the page cannot reach any
 * other tenant's reviews or trigger a sync.
 */
export function resolveReviewsIntegrationStatus(): ReviewsIntegrationStatus {
  return "not_connected";
}
