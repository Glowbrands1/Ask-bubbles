import type { Metadata } from "next";

import { PermissionGate } from "@/components/permission-gate";
import { loadGoogleReviewsPage } from "@/features/admin/google-reviews/load";
import { GoogleReviewsScreen } from "@/features/admin/google-reviews/google-reviews-screen";
import { requirePagePermission } from "@/lib/auth/page";

export const metadata: Metadata = {
  title: "Google Reviews",
};

export const dynamic = "force-dynamic";

/** `manage_integrations`, guarded on the server before anything is read. */
export default async function GoogleReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePagePermission("manage_integrations");

  const props = await loadGoogleReviewsPage(await searchParams);

  return (
    <PermissionGate permission="manage_integrations" adminOnly>
      <GoogleReviewsScreen {...props} />
    </PermissionGate>
  );
}
