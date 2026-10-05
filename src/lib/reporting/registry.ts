import { COMPANY_REPORTS } from "@/config/company/reports";

import type { ReportCadence } from "./read/freshness-line";

/**
 * ============================================================================
 * THE REPORT REGISTRY — the one place a report is declared
 * ============================================================================
 *
 * Ask Sunny registered each report family in five separate places (routes,
 * families, catalogue, parsers, chat routing). Here a report is ONE entry, and
 * every consumer — the Reports navigation, the `/reports` index, the report
 * page, chat routing and the "Ask about this report" panel — reads it:
 *
 *   id             stable key; the URL segment and the chat context's pointer
 *   label/summary  what the index and the tabs show
 *   cadence        how often the data is expected to refresh
 *   questionTerms  questions that need this report's figures in chat
 *   status         "placeholder" reports are labelled; nothing fake is shown
 *
 * CLIENT-SAFE METADATA ONLY. A report's server-side data loader (its query,
 * its briefing for chat) is registered separately in
 * `src/config/company/reports.server.ts`, so declaring a report never pulls a
 * database client into a browser bundle.
 *
 * The catalog itself is company configuration (`src/config/company/reports`).
 * Buff City Soap's catalog is EMPTY until real report sources are connected:
 * no fabricated KPIs are presented as real.
 */
export interface ReportDefinition {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly cadence: ReportCadence;
  /** Phrases that route a chat question to this report's figures. */
  readonly questionTerms: readonly RegExp[];
  /** The permission a viewer needs beyond `view_reports`, if any. */
  readonly status: "placeholder" | "live";
}

export const REPORTS_SECTION_PATH = "/reports";

export function reportPath(id: string): string {
  return `${REPORTS_SECTION_PATH}/${encodeURIComponent(id)}`;
}

export const REPORT_REGISTRY: readonly ReportDefinition[] = COMPANY_REPORTS;

export function reportById(id: string | null | undefined): ReportDefinition | undefined {
  if (!id) return undefined;
  return REPORT_REGISTRY.find((report) => report.id === id);
}

/** The reports a chat question needs figures from, by the question's own words. */
export function routeReportQuestion(question: string): string[] {
  const text = question ?? "";
  return REPORT_REGISTRY.filter((report) =>
    report.questionTerms.some((term) => term.test(text)),
  ).map((report) => report.id);
}

/** Problems with the registry. Empty when it is coherent. */
export function registryProblems(): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const report of REPORT_REGISTRY) {
    if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(report.id)) problems.push(`Report id "${report.id}" is not a URL-safe slug.`);
    if (ids.has(report.id)) problems.push(`Report id "${report.id}" is registered twice.`);
    ids.add(report.id);
    if (!report.label.trim()) problems.push(`Report "${report.id}" has no label.`);
  }
  return problems;
}
