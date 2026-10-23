/**
 * A grouped read of Sales Totals, the Comp Report, or Google reviews.
 *
 * Only dimensions those tables actually store are offered. Product, category,
 * employee, and a summed week are named as missing. Nothing here adds daily
 * rows together. Off, callers do not use this.
 */

export type BreakdownKind = "none" | "unavailable" | "sales" | "comp" | "reviews";

export interface BreakdownPlan {
  readonly kind: BreakdownKind;
  readonly report: "Sales Totals" | "Comp Report" | "Google Reviews" | null;
  readonly metric: string | null;
  readonly groupBy: "day" | "month" | "store" | "rating" | null;
  readonly rating: "1" | "2" | "3" | "4" | "5" | null;
  readonly compare: "prior-period" | "last-year" | null;
  readonly unavailable: string | null;
  readonly note: string;
}

const NONE: BreakdownPlan = {
  kind: "none",
  report: null,
  metric: null,
  groupBy: null,
  rating: null,
  compare: null,
  unavailable: null,
  note: "",
};

const BREAKDOWN =
  /\b(?:break\s*down|breakdown|by day|by week|by month|by store|by salon|by product|by category|by employee|which products|which packages|top stores|top salons|vs\.? last|versus last|compared with last|compared to last)\b/i;

export function planReportBreakdown(question: string): BreakdownPlan {
  const text = question ?? "";
  const star = /\b([1-5])\s*[- ]?\s*stars?\b/i.exec(text);
  if (star && /\breviews?\b/i.test(text)) {
    return {
      kind: "reviews",
      report: "Google Reviews",
      metric: "rating",
      groupBy: /\bby (?:store|salon)\b|\bper (?:store|salon)\b|\btop (?:stores|salons)\b/i.test(text) ? "store" : "rating",
      rating: star[1] as BreakdownPlan["rating"],
      compare: null,
      unavailable: null,
      note: "Counts come from the review feed for this account's listings. They are not estimated.",
    };
  }
  if (!BREAKDOWN.test(text)) return NONE;

  if (/\b(?:by product|which products|which packages|by category|by employee)\b/i.test(text)) {
    const dimension = /\bby employee\b/i.test(text) ? "employee" : /\bby category\b/i.test(text) ? "category" : "product";
    return {
      kind: "unavailable",
      report: null,
      metric: null,
      groupBy: null,
      rating: null,
      compare: null,
      unavailable: dimension,
      note: `Sales Totals and the Comp Report do not store a ${dimension} dimension. No ${dimension} breakdown was invented.`,
    };
  }
  if (/\bby week\b/i.test(text)) {
    return {
      kind: "unavailable",
      report: null,
      metric: null,
      groupBy: null,
      rating: null,
      compare: null,
      unavailable: "week",
      note: "Daily rows are not added together into a week. Ask for the days, or use a stored month-to-date row.",
    };
  }

  const reviews = /\breviews?\b/i.test(text);
  if (reviews) {
    return {
      kind: "reviews",
      report: "Google Reviews",
      metric: "rating",
      groupBy: /\bby day\b/i.test(text) ? "rating" : "store",
      rating: null,
      compare: null,
      unavailable: null,
      note: "Review rows are this account's listings only. No rating was estimated.",
    };
  }

  return {
    kind: "unavailable",
    report: null,
    metric: null,
    groupBy: null,
    rating: null,
    compare: null,
    unavailable: "report",
    note: "This app's chat does not invent a Sales Totals or Comp Report breakdown. No figure was computed.",
  };
}

export interface BreakdownRow {
  readonly label: string;
  readonly when: string;
  readonly value: string;
}

const ROW_CAP = 40;

export function formatBreakdown(plan: BreakdownPlan, rows: readonly BreakdownRow[], asOf: string | null): string {
  if (plan.kind === "none") return "";
  if (plan.kind === "unavailable" || plan.unavailable) {
    const title = plan.report ?? "REPORT BREAKDOWN";
    return `${title}\n\n${plan.note}`;
  }
  const capped = rows.slice(0, ROW_CAP);
  const when = asOf ? `As of ${asOf}.` : "No as-of date was stored on these rows.";
  const body =
    capped.length === 0
      ? "No stored rows matched this account and filter."
      : capped.map((row) => `- ${row.label} (${row.when}): ${row.value}`).join("\n");
  const more = rows.length > ROW_CAP ? `\n\n${rows.length - ROW_CAP} more rows were not listed.` : "";
  return `${plan.report}\n\n${when} ${plan.note}\n${body}${more}`;
}
