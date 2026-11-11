import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { businessToday } from "@/lib/business-date";
import { attentionSummary } from "@/lib/forms/follow-up";
import { pageShowsAppSwitcher, pageShowsLeadershipHubTab } from "@/lib/auth/app-switcher";
import { pageIdentity } from "@/lib/auth/page";
import { visibleInstances } from "@/lib/forms/instance-scope";
import { pageFormsAccess } from "@/lib/forms/page-scope";
import { listOutstandingFollowUps } from "@/lib/forms/instances";
import { privateAwareLimit } from "@/lib/forms/private-creators";

/**
 * COUNTS, NOT HUES — the rail's overdue badge.
 *
 * The direction adds a count to Form Monitoring in the left rail: the same
 * overdue follow-ups the band and the Overview report, in a third place, in the
 * same coral. Its point is that the rail should carry INFORMATION rather than a
 * colour per section.
 *
 * IT IS READ HERE, ON THE SERVER, THROUGH THE SAME MODULE the Overview and Form
 * Monitoring use. That is the whole reason it is in the layout and not in the
 * sidebar component: a browser-side recount is exactly how the Overview and
 * Form Monitoring came to state different numbers about the same location, and a
 * badge that disagrees with the page it links to is worse than no badge.
 *
 * The rail is on every screen, so this is one Forms read per navigation. The
 * whole `(app)` group is already server-rendered per request, so it adds a
 * query rather than a rendering mode — and a failure returns zero and hides the
 * badge instead of taking down every page in the group.
 */
async function overdueCount(): Promise<number> {
  try {
    const today = businessToday();
    // The badge counts only forms this reader may open; see `withoutUnreadable`.
    const access = await pageFormsAccess(await pageIdentity());
    if (access.noStore) return 0;
    const outstanding = visibleInstances(
      access.actor,
      // PRIVATE_CREATOR_FORMS: over-read, then trim to the page of 50; off, 50 itself.
      await listOutstandingFollowUps(privateAwareLimit(50), access.locationIds, access.ownCreatedBy),
    ).slice(0, 50);
    return attentionSummary(outstanding, today).overdue;
  } catch {
    return 0;
  }
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [overdueFollowUps, showAppSwitcher, showLeadershipHub] = await Promise.all([
    overdueCount(),
    pageShowsAppSwitcher(),
    pageShowsLeadershipHubTab(),
  ]);
  return (
    <AppShell
      overdueFollowUps={overdueFollowUps}
      showAppSwitcher={showAppSwitcher}
      showLeadershipHub={showLeadershipHub}
    >
      {children}
    </AppShell>
  );
}
