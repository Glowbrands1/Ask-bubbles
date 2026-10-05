import "server-only";

import type { ReportingScope } from "@/lib/reporting/scope/authorized-locations";
import type { ChatReportContext } from "@/lib/reporting/report-context";

/**
 * Server-side data adapters for the company's reports, keyed by report id.
 *
 * A loader receives the asker's RESOLVED scope — never a scope from the
 * request — and returns the text block chat is grounded on, or null when it
 * has no delivery for the period. EMPTY: no Buff report is connected.
 */
export interface ReportBriefingLoaderInput {
  readonly question: string;
  readonly today: string;
  readonly scope: ReportingScope;
  readonly context: ChatReportContext | null;
}

export type ReportBriefingLoader = (input: ReportBriefingLoaderInput) => Promise<string | null>;

export const COMPANY_REPORT_LOADERS: Readonly<Record<string, ReportBriefingLoader>> = {};
