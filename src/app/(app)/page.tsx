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
import { followUpState } from "@/lib/forms/follow-up";
import { readFollowUpQueue } from "@/lib/forms/follow-up-queue";
import { pageFormsAccess } from "@/lib/forms/page-scope";
import { areaLabel } from "@/lib/locations";
import { HrOverviewCard } from "@/features/forms/hr-approval-lists";
import { hrQueueSummary } from "@/lib/forms/hr-approval";

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
      /*
       * THE ONE QUEUE (port from Ask Sunny; QA, 24 Nov 2026: 19 overdue on the Overview, 8 on the Overdue pill).
       * `readFollowUpQueue` is what the rail, the Forms Register's banner and its pills count too: every outstanding
       * follow-up this reader may open, read without a cap, with non-production records held back (they stay in the
       * Forms Register). See `lib/forms/follow-up-queue.ts`.
       */
      const queue = await readFollowUpQueue(access, { today });
      const production = queue.forms;

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
        attention: queue.attention,
        items,
        today,
        failure: null,
        excluded: queue.excluded,
        scopeLabel:
          locationIds === null ? null : locationIds.length === 1 ? areaLabel(locationIds[0]) : null,
      };
    } catch (error) {
      followUps = { ...followUps, failure: (error as Error).message };
    }
  }

  /* HR APPROVAL: the approver's count of forms waiting for them, overdue marked. Nobody else gets the card. */
  const hrSummary = await hrQueueSummary((await pageFormsAccess(identity)).actor).catch(() => null);

  return (
    <PermissionGate permission="view_overview">
      <OverviewScreen
        followUps={followUps}
        hrApprovalCard={hrSummary ? <HrOverviewCard pending={hrSummary.pending} overdue={hrSummary.overdue} /> : undefined}
      />
    </PermissionGate>
  );
}
