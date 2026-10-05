import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PermissionGate } from "@/components/permission-gate";
import { ReportPlaceholder } from "@/features/reports/report-placeholder";
import { REPORTS } from "@/features/reports/reports-routes";
import { requirePagePermission } from "@/lib/auth/page";
import { resolveReportingScope } from "@/lib/reporting/scope/server";
import { scopeNoticeSentence } from "@/lib/reporting/scope/authorized-locations";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ reportId: string }>;
}): Promise<Metadata> {
  const { reportId } = await params;
  return { title: REPORTS.find((report) => report.key === reportId)?.label ?? "Report" };
}

/**
 * ONE REPORT, BY REGISTRY ID. An id the registry does not declare is a 404 —
 * never a guess at a neighbouring report. A declared report whose page has not
 * been built yet renders an honest placeholder rather than sample figures.
 */
export default async function ReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  await requirePagePermission("view_reports");
  const { reportId } = await params;
  const report = REPORTS.find((entry) => entry.key === reportId);
  if (!report) notFound();

  const scope = await resolveReportingScope();

  return (
    <PermissionGate permission="view_reports">
      <ReportPlaceholder report={report} scopeNotice={scopeNoticeSentence(scope)} />
    </PermissionGate>
  );
}
