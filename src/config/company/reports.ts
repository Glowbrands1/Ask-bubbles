import type { ReportDefinition } from "@/lib/reporting/registry";

/**
 * ============================================================================
 * BUFF CITY SOAP — REPORT CATALOG (COMPANY CONFIGURATION)
 * ============================================================================
 *
 * DELIBERATELY EMPTY. Buff City Soap's reports and KPI definitions have not
 * been supplied, and no report source is connected. The Reports area renders
 * an honest empty state rather than invented metrics.
 *
 * TO ADD A REPORT:
 *   1. Add its definition here (id, label, summary, cadence, questionTerms).
 *   2. Register its server-side loader in `reports.server.ts`.
 *   3. Add its page under `src/app/(app)/reports/[reportId]/` content, built
 *      from the report kit in `src/features/reports/kit/`.
 *   4. If it is ingested from a file, add a `ReportParser` and the migration
 *      for its fact table (see `docs/reports.md`).
 */
export const COMPANY_REPORTS: readonly ReportDefinition[] = [];
