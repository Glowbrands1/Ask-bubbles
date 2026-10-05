import { Construction } from "lucide-react";

import { EmptyState, Notice } from "@/components/ui/feedback";

import { ReportFrame } from "./report-frame";
import type { ReportRoute } from "./reports-routes";

/**
 * A REGISTERED REPORT WHOSE PAGE IS NOT BUILT YET. Says so, and shows nothing
 * that could be read as a figure. A report's real page replaces this one with
 * the report kit (`./kit`, `./chart-kit`, `./filter-row`, `./detail-section`).
 */
export function ReportPlaceholder({
  report,
  scopeNotice,
}: {
  report: ReportRoute;
  scopeNotice: string | null;
}) {
  return (
    <ReportFrame report={report}>
      {scopeNotice ? <Notice>{scopeNotice}</Notice> : null}
      <EmptyState
        icon={<Construction />}
        title="This report is not connected yet"
        description="It is registered, but its data source has not been connected, so there are no figures to show."
      />
    </ReportFrame>
  );
}
