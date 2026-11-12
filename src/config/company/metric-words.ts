/**
 * ============================================================================
 * THE COMPANY'S OWN SALES METRICS (COMPANY CONFIGURATION)
 * ============================================================================
 *
 * COMPANY_METRIC_WORDS_NOT_NAMES_ENABLED (QA, 11 Nov 2026). A capitalised
 * phrase made only of these words, with measure words ("avg", "rate") and
 * percent signs, is a metric, never a person: "She was below goal in IPT, AOV
 * and Comp Sales % for October" named nobody, but "Comp Sales" was read as a
 * person and the Corrective Action lost its Issue.
 *
 * Buff City Soap's KPIs, as its Domo reporting deck names them (Daily and
 * Weekly FZ Operations Sales KPI dashboards): Net Sales, Comp Sales % (SSSG),
 * Items per Transaction (IPT), Average Order Value (AOV), Discount Rate %,
 * Product Mix and Laundry % of sales, and AUV cohorts.
 *
 * Somebody on the manager's roster is always a person, whatever this list
 * says (`forms/person-guard.ts`): "Delphine Sales" is still Delphine Sales.
 * The sibling app keeps its own words in its own configuration.
 */
export const COMPANY_METRIC_PHRASES: readonly string[] = [
  "IPT",
  "AOV",
  "Comp",
  "Comp Sales",
  "SSSG",
  "Net Sales",
  "Discount Rate",
  "Product Mix",
  "Laundry %",
  "AUV",
  "items per transaction",
  "average order value",
];
