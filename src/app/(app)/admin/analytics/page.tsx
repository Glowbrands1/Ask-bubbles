import type { Metadata } from "next";

import { PermissionGate } from "@/components/permission-gate";
import { AnalyticsUnavailable } from "@/features/admin/analytics/analytics-unavailable";
import { AnalyticsScreen } from "@/features/admin/analytics/analytics-screen";
import { loadAnalyticsPage } from "@/features/admin/analytics/load";
import { requirePagePermission } from "@/lib/auth/page";
import { supabaseSecretKeyConfigured } from "@/lib/config/server-env";

export const metadata: Metadata = {
  title: "Analytics",
};

/*
 * LIVE ON EVERY REQUEST, like the reports. Adoption figures that a manager is
 * about to act on must not be served from a cache built before the action they
 * are checking for.
 */
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePagePermission("view_analytics");
  const loaded = supabaseSecretKeyConfigured()
    ? await loadAnalyticsPage("overview", await searchParams).catch(() => null)
    : null;

  return (
    <PermissionGate permission="view_analytics" adminOnly>
      {loaded ? (
        <AnalyticsScreen {...loaded} />
      ) : (
        <AnalyticsUnavailable reason={supabaseSecretKeyConfigured() ? "failed" : "not_connected"} />
      )}
    </PermissionGate>
  );
}
