import type { AccessScope } from "@/types";

/**
 * ============================================================================
 * STORE REPORTING — THE SHAPE OF THE DEMO SAMPLE, AND ITS ARITHMETIC
 * ============================================================================
 *
 * DEMO BUILDS ONLY. Buff City Soap's report catalog is empty until a real
 * source is connected (`config/company/reports.ts`); a demo build declares two
 * reports and fills them from an invented weekly store table that only the demo
 * runtime returns (`data/demo/reports.ts`). This module holds no figures: it
 * describes the rows and adds them up, so the report screen can scope and
 * summarise whatever sample it is handed.
 *
 * Client-safe: the report body narrows the rows to the demo viewer's scope in
 * the browser, because the demo's role switcher lives there.
 */

/** One store's completed Monday–Sunday week. Money in dollars. */
export interface DemoStoreWeek {
  readonly locationId: string;
  /** `yyyy-mm-dd`, the Monday. */
  readonly weekStart: string;
  readonly netSales: number;
  /** The same store's net sales for the same week a year earlier. */
  readonly lastYearNetSales: number;
  readonly transactions: number;
  readonly units: number;
  readonly laborHours: number;
  readonly laborCost: number;
  /** Guests at Makery classes and parties. */
  readonly makeryGuests: number;
}

export interface DemoScopeArea {
  readonly label: string;
  readonly locationIds: readonly string[];
}

export interface ReportsSample {
  readonly weeks: readonly DemoStoreWeek[];
  /** Every store in the sample, with its display name, in roster order. */
  readonly stores: readonly { readonly id: string; readonly name: string }[];
  /** The demo accounts' area ids → the stores they cover. */
  readonly areas: Readonly<Record<string, DemoScopeArea>>;
  /** The Sunday closing the latest week held. */
  readonly periodEnd: string;
  /** When the sample "arrived": the Monday morning after the latest week. */
  readonly refreshedAt: string;
}

export interface DemoReportScope {
  readonly unrestricted: boolean;
  readonly locationIds: readonly string[];
  readonly label: string | null;
}

/** The stores a demo account covers. Global sees all; an unknown area sees none (fail closed). */
export function demoReportScope(sample: ReportsSample, scope: AccessScope | null | undefined): DemoReportScope {
  if (!scope) return { unrestricted: false, locationIds: [], label: null };
  if (scope.level === "global") return { unrestricted: true, locationIds: sample.stores.map((s) => s.id), label: null };
  const ids = new Set<string>();
  const labels: string[] = [];
  for (const area of [scope.primaryAreaId, ...scope.alsoCoversAreaIds]) {
    if (!area) continue;
    const known = sample.areas[area];
    if (known) {
      known.locationIds.forEach((id) => ids.add(id));
      labels.push(known.label);
    } else if (sample.stores.some((s) => s.id === area)) {
      ids.add(area);
      labels.push(sample.stores.find((s) => s.id === area)!.name);
    }
  }
  return {
    unrestricted: false,
    locationIds: sample.stores.map((s) => s.id).filter((id) => ids.has(id)),
    label: labels[0] ?? null,
  };
}

export const DEMO_PERIOD_WEEKS = [1, 4, 13] as const;
export type DemoPeriodWeeks = (typeof DEMO_PERIOD_WEEKS)[number];

export function parseDemoPeriod(value: string | null | undefined): DemoPeriodWeeks {
  const n = Number(value);
  return (DEMO_PERIOD_WEEKS as readonly number[]).includes(n) ? (n as DemoPeriodWeeks) : 4;
}

/** The Mondays held, newest first. */
export function weekStarts(sample: ReportsSample): string[] {
  return [...new Set(sample.weeks.map((w) => w.weekStart))].sort().reverse();
}

export interface StoreTotals {
  readonly locationId: string;
  readonly name: string;
  readonly netSales: number;
  readonly lastYearNetSales: number;
  readonly transactions: number;
  readonly units: number;
  readonly laborHours: number;
  readonly laborCost: number;
  readonly makeryGuests: number;
}

export function sumWeeks(rows: readonly DemoStoreWeek[]): Omit<StoreTotals, "locationId" | "name"> {
  const total = { netSales: 0, lastYearNetSales: 0, transactions: 0, units: 0, laborHours: 0, laborCost: 0, makeryGuests: 0 };
  for (const r of rows) {
    total.netSales += r.netSales;
    total.lastYearNetSales += r.lastYearNetSales;
    total.transactions += r.transactions;
    total.units += r.units;
    total.laborHours += r.laborHours;
    total.laborCost += r.laborCost;
    total.makeryGuests += r.makeryGuests;
  }
  return total;
}

/** Per-store totals for the latest `weeks` weeks, for the given stores, in roster order. */
export function storeTotals(sample: ReportsSample, locationIds: readonly string[], weeks: number): StoreTotals[] {
  const held = new Set(weekStarts(sample).slice(0, weeks));
  return sample.stores
    .filter((s) => locationIds.includes(s.id))
    .map((s) => ({
      locationId: s.id,
      name: s.name,
      ...sumWeeks(sample.weeks.filter((w) => w.locationId === s.id && held.has(w.weekStart))),
    }));
}

/** Week-by-week totals across the given stores, oldest first. */
export function weeklySeries(sample: ReportsSample, locationIds: readonly string[], weeks: number) {
  return weekStarts(sample)
    .slice(0, weeks)
    .reverse()
    .map((weekStart) => ({
      weekStart,
      ...sumWeeks(sample.weeks.filter((w) => w.weekStart === weekStart && locationIds.includes(w.locationId))),
    }));
}

export const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
