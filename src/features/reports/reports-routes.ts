import { REPORT_REGISTRY, REPORTS_SECTION_PATH, reportPath } from "@/lib/reporting/registry";

/**
 * The Reports navigation, derived from the report registry so a report is
 * declared once. `/reports` is a real index page — it lists what exists and,
 * with nothing registered, says so — rather than a redirect to a first report
 * that may not exist.
 */
export { REPORTS_SECTION_PATH };

export interface ReportRoute {
  readonly key: string;
  readonly label: string;
  readonly summary: string;
  readonly path: string;
}

export const REPORTS: readonly ReportRoute[] = REPORT_REGISTRY.map((report) => ({
  key: report.id,
  label: report.label,
  summary: report.summary,
  path: reportPath(report.id),
}));

/** Where the sidebar's Reports entry goes: always the index. */
export const REPORTS_DEFAULT_PATH = REPORTS_SECTION_PATH;

export function reportForPath(pathname: string): ReportRoute | null {
  return (
    REPORTS.find((report) => pathname === report.path || pathname.startsWith(`${report.path}/`)) ??
    null
  );
}
