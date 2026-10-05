/**
 * ============================================================================
 * REPORTING — DATABASE-INDEPENDENT TYPES
 * ============================================================================
 *
 * The platform shape every ingested report shares. A company report family
 * (registered in `src/config/company/reports.ts`) extends `ParsedReport` with
 * its own facts; nothing here names a metric, a store attribute or a KPI.
 */

/** Period grains a report may be filed under. Mirrored by `report_period_grain`. */
export type ReportPeriodGrain = "day" | "week" | "month" | "quarter" | "year" | "mtd" | "ytd" | "ltm";

/** How a measure's values combine. Mirrored by `report_metric_unit`. */
export type ReportMetricUnit =
  | "currency"
  | "count"
  | "hours"
  | "ratio"
  | "percent"
  | "rank"
  | "years";

export interface ParsedPeriod {
  grain: ReportPeriodGrain;
  /** Inclusive, ISO `YYYY-MM-DD`. */
  periodEnd: string;
  periodStart: string;
  fiscalYear: number;
  /** The period exactly as the source printed it, for lineage. */
  labelRaw: string;
}

export interface ParserWarning {
  code: string;
  message: string;
  column?: string;
  row?: number;
}

/**
 * What every parser returns. A family's parser returns a subtype carrying its
 * facts; the platform reads only these fields (lineage, period, warnings).
 */
export interface ParsedReport {
  /** The registry id of the report family this belongs to. */
  reportFamily: string;
  parserKey: string;
  parserVersion: number;
  period: ParsedPeriod;
  warnings: ParserWarning[];
}
