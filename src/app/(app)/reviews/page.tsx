import type { Metadata } from "next";

import { PermissionGate } from "@/components/permission-gate";
import { resolveReviewsIntegrationStatus } from "@/features/reviews/integration-status";
import { loadReviewsData } from "@/features/reviews/load";
import { ReviewsDashboard } from "@/features/reviews/reviews-dashboard";
import { parseReviewsTab } from "@/features/reviews/reviews-tabs";
import { requirePagePermission } from "@/lib/auth/page";

export const metadata: Metadata = {
  title: "Google Reviews",
};

export const dynamic = "force-dynamic";

/**
 * THE GOOGLE REVIEWS PAGE. Same permission as always (`view_reports`, the Insights permission Reports uses),
 * and it reads only the imported Google reviews (server-side, after the permission check), never Google itself.
 */
export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission("view_reports");
  const params = await searchParams;
  const tab = parseReviewsTab(params.tab);
  const data = await loadReviewsData(params, tab === "reviews");

  return (
    <PermissionGate permission="view_reports">
      <ReviewsDashboard
        tab={tab}
        status={resolveReviewsIntegrationStatus()}
        data={data}
      />
    </PermissionGate>
  );
}
