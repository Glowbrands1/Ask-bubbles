import { isDemoMode } from "@/lib/config/runtime";
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
/**
 * DEMO BUILDS ONLY: two store reports, filled from the demo runtime's invented
 * weekly figures (`data/demo/reports.ts`) and labelled as such on the page. A
 * live build still declares nothing. No question terms: chat never routes a
 * question to a demo report's figures.
 */
const DEMO_REPORTS: readonly ReportDefinition[] = [
  {
    id: "store-sales",
    label: "Store Sales",
    summary: "Net sales, transactions, average ticket and units per transaction by store, against last year.",
    cadence: "weekly",
    questionTerms: [],
    status: "live",
  },
  {
    id: "labor-productivity",
    label: "Labor & Productivity",
    summary: "Labor hours and cost against sales, sales per labor hour and Makery guests by store.",
    cadence: "weekly",
    questionTerms: [],
    status: "live",
  },
];

export const COMPANY_REPORTS: readonly ReportDefinition[] = isDemoMode() ? DEMO_REPORTS : [];
