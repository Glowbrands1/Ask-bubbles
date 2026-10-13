import type { Metadata } from "next";

import { PermissionGate } from "@/components/permission-gate";
import { resolveReviewsIntegrationStatus } from "@/features/reviews/integration-status";
import { ReviewsDashboard } from "@/features/reviews/reviews-dashboard";
import { parseReviewsTab } from "@/features/reviews/reviews-tabs";
import { requirePagePermission } from "@/lib/auth/page";

export const metadata: Metadata = {
  title: "Google Reviews",
};

export const dynamic = "force-dynamic";

/**
 * THE GOOGLE REVIEWS PAGE. Same permission as always (`view_reports`, the Insights permission Reports uses),
 * and it reads nothing: no database, no Google API, no other tenant's data.
 * See `features/reviews/integration-status.ts`.
 */
export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission("view_reports");
  const { tab } = await searchParams;

  return (
    <PermissionGate permission="view_reports">
      <ReviewsDashboard
        tab={parseReviewsTab(tab)}
        status={resolveReviewsIntegrationStatus()}
      />
    </PermissionGate>
  );
}
