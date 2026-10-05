import type { Metadata } from "next";

import { PermissionGate } from "@/components/permission-gate";
import { ReportsIndex } from "@/features/reports/reports-index";
import { requirePagePermission } from "@/lib/auth/page";
import { resolveReportingScope } from "@/lib/reporting/scope/server";
import { scopeNoticeSentence } from "@/lib/reporting/scope/authorized-locations";

export const metadata: Metadata = {
  title: "Reports",
};

export const dynamic = "force-dynamic";

/**
 * THE REPORTS INDEX. Lists the reports the company registry declares and,
 * with none declared, says so plainly. No figure on this page is invented:
 * it renders metadata from the registry and the viewer's own scope notice.
 */
export default async function ReportsPage() {
  await requirePagePermission("view_reports");
  const scope = await resolveReportingScope();

  return (
    <PermissionGate permission="view_reports">
      <ReportsIndex scopeNotice={scopeNoticeSentence(scope)} />
    </PermissionGate>
  );
}
