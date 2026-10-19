import type { Metadata } from "next";

import {
  OverviewScreen,
  type OverviewFollowUp,
  type OverviewFollowUps,
} from "@/features/dashboard/overview";
import { PermissionGate } from "@/components/permission-gate";
import { pageCan, requirePagePermission } from "@/lib/auth/page";
import { supabaseSecretKeyConfigured } from "@/lib/config/server-env";
import { businessToday } from "@/lib/business-date";
import { attentionSummary, followUpState } from "@/lib/forms/follow-up";
import { visibleInstances } from "@/lib/forms/instance-scope";
import { pageFormsAccess } from "@/lib/forms/page-scope";
import { listOutstandingFollowUps } from "@/lib/forms/instances";
import { configuredExcludedNames, isProductionRecord } from "@/lib/forms/production-records";
import { areaLabel } from "@/lib/locations";

export const metadata: Metadata = {
  title: "Home",
};

export const dynamic = "force-dynamic";

/**
 * HOME. The follow-up queue is read on the server, narrowed to the viewer's
 * VERIFIED scope (never one from the request), and handed to the screen.
 */
export default async function HomePage() {
  const identity = await requirePagePermission("view_overview");

  const today = businessToday();
  let followUps: OverviewFollowUps = {
    attention: { overdue: 0, dueThisWeek: 0, needsAttention: 0 },
    items: [],
    today,
    failure: null,
    excluded: 0,
    scopeLabel: null,
    connected: supabaseSecretKeyConfigured(),
  };

  /* No database configured (a demo or an unconfigured preview): there is no
     forms record to read, which is not a failure, so nothing is attempted. */
  if (followUps.connected && (await pageCan("view_form_monitoring"))) {
    try {
      const access = await pageFormsAccess(identity);
      const locationIds = access.locationIds;
      const outstanding = access.noStore
        ? []
        : visibleInstances(access.actor, await listOutstandingFollowUps(50, locationIds));

      const excludedNames = configuredExcludedNames();
      const production = outstanding.filter((instance) =>
        isProductionRecord(
          {
            employeeName: instance.employeeName,
            locationName: instance.locationName,
            locationId: instance.locationId,
          },
          { excludedNames },
        ),
      );

      const items: OverviewFollowUp[] = production.map((instance) => ({
        id: instance.id,
        employeeName: instance.employeeName,
        templateName: instance.templateName,
        locationName: instance.locationName,
        followUpDate: instance.followUpDate ?? today,
        overdue: followUpState(instance, today) === "overdue",
      }));

      followUps = {
        ...followUps,
        attention: attentionSummary(production, today),
        items,
        today,
        failure: null,
        excluded: outstanding.length - production.length,
        scopeLabel:
          locationIds === null ? null : locationIds.length === 1 ? areaLabel(locationIds[0]) : null,
      };
    } catch (error) {
      followUps = { ...followUps, failure: (error as Error).message };
    }
  }

  return (
    <PermissionGate permission="view_overview">
      <OverviewScreen followUps={followUps} />
    </PermissionGate>
  );
}
