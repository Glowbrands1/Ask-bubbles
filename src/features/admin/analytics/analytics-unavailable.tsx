import { BarChart3 } from "lucide-react";

import { EmptyState } from "@/components/ui/feedback";
import { PageHeader, PageShell } from "@/components/ui/layout";
import { ACTIVE_BRAND } from "@/lib/brand";

/**
 * ANALYTICS WITH NOTHING TO READ. Adoption figures live only in the database,
 * so a deployment without one (a demo, an unconfigured preview) — or one whose
 * database did not answer — says so instead of failing the page.
 */
export function AnalyticsUnavailable({ reason }: { reason: "not_connected" | "failed" }) {
  return (
    <PageShell>
      <PageHeader
        title="Analytics"
        description={`Who is using ${ACTIVE_BRAND.productName}, from which location, how often, and what for.`}
      />
      <EmptyState
        icon={<BarChart3 />}
        title={
          reason === "not_connected"
            ? "Analytics needs the live database"
            : "Analytics could not be loaded"
        }
        description={
          reason === "not_connected"
            ? "This deployment has no database connected, so there is no recorded activity to show. Nothing here is estimated or sampled."
            : "The database did not answer. Try again in a moment; no figures are shown rather than partial ones."
        }
      />
    </PageShell>
  );
}
