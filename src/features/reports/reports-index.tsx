import Link from "next/link";
import { BarChart3, ChevronRight } from "lucide-react";

import { EmptyState, Notice } from "@/components/ui/feedback";

import { ReportBand } from "./report-frame";
import { REPORTS } from "./reports-routes";

/**
 * The Reports landing page. Driven entirely by the report registry.
 */
export function ReportsIndex({ scopeNotice }: { scopeNotice: string | null }) {
  return (
    <div className="min-w-0">
      <ReportBand
        title="Reports"
        description="Reports connected to this workspace. Figures are scoped to your assignment."
      />
      <div className="flex min-w-0 flex-col gap-5 px-5 py-5 pb-7 sm:px-6">
        {scopeNotice ? <Notice>{scopeNotice}</Notice> : null}
        {REPORTS.length === 0 ? (
          <EmptyState
            icon={<BarChart3 />}
            title="No reports are connected yet"
            description="Reporting is set up and waiting for its first data source. When a report is connected it appears here, scoped to the locations on your assignment. Nothing on this page is sample data."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {REPORTS.map((report) => (
              <li key={report.key}>
                <Link
                  href={report.path}
                  className="flex items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-soft transition-colors hover:bg-hover-surface"
                >
                  <span className="min-w-0">
                    <span className="block text-[14px] font-bold text-foreground">{report.label}</span>
                    <span className="mt-1 block text-[12.5px] leading-relaxed text-muted-foreground">
                      {report.summary}
                    </span>
                  </span>
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
