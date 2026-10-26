import type { Metadata } from "next";

import { PermissionGate } from "@/components/permission-gate";
import { Notice } from "@/components/ui/feedback";
import { resolveReviewsIntegrationStatus } from "@/features/reviews/integration-status";
import { loadReviewsData } from "@/features/reviews/load";
import { ReviewsDashboard } from "@/features/reviews/reviews-dashboard";
import { parseReviewsTab } from "@/features/reviews/reviews-tabs";
import { requirePagePermission } from "@/lib/auth/page";
import { REVIEWS_UPDATE_NOTE, reviewsUpdateNoteEnabled } from "@/lib/google-reviews/update-note";

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
      {/* GOOGLE_REVIEWS_UPDATE_NOTE_ENABLED; see `lib/google-reviews/update-note.ts`. */}
      {reviewsUpdateNoteEnabled() ? (
        <div className="px-5 pt-5 sm:px-6">
          <Notice tone="attention">
            <p>{REVIEWS_UPDATE_NOTE}</p>
          </Notice>
        </div>
      ) : null}
      <ReviewsDashboard
        tab={tab}
        status={resolveReviewsIntegrationStatus()}
        data={data}
      />
    </PermissionGate>
  );
}
