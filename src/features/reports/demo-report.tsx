"use client";

import { useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Notice } from "@/components/ui/feedback";
import { ProvenanceChip, ProvenanceChips } from "@/components/ui/marquee";
import { ACTIVE_BRAND } from "@/lib/brand";
import {
  DEMO_PERIOD_WEEKS,
  demoReportScope,
  parseDemoPeriod,
  ratio,
  storeTotals,
  sumWeeks,
  weekStarts,
  weeklySeries,
  type DemoReportScope,
  type ReportsSample,
  type StoreTotals,
} from "@/lib/reporting/demo-sample";
import { useSession } from "@/lib/session/session-context";

import { AXIS_PROPS, CHART_COLORS, ChartFrame, ChartLegend, ChartTooltip, GRID_PROPS } from "./chart-kit";
import { ReportDetailSection } from "./detail-section";
import { useQueryNavigation, SingleSelectMenu } from "./filter-menu";
import { FilterRow } from "./filter-row";
import { BedSpaDataTable, type TableColumn } from "./kit/data-table";
import { KpiCardRow, trendFor, type KpiCard } from "./kit/kpi-cards";
import { formatPeriodEnd } from "./kit/scope-banner";

/**
 * ============================================================================
 * A DEMO REPORT — THE REPORT KIT, FILLED FROM THE LABELLED SAMPLE
 * ============================================================================
 *
 * Demo builds only. The page hands over the demo runtime's invented weekly
 * store table; this narrows it to the DEMO VIEWER'S scope (the role switcher
 * lives in the browser, so the scope is read here, from the session), then to
 * the period and store in the URL, and renders it with the same kit the live
 * reports use — KPI row, chart frame, filter row, sortable table.
 */

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const money2 = (n: number | null) => (n === null ? null : `$${n.toFixed(2)}`);
const pct = (n: number | null, digits = 1) => (n === null ? null : `${(n * 100).toFixed(digits)}%`);
const signed = (n: number | null) => (n === null ? undefined : `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}% vs last year`);
const signedPct = (n: number | null) => (n === null ? null : `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`);
const weekLabel = (monday: string) => formatPeriodEnd(monday).replace(/, \d{4}$/, "");

/** The demo viewer's scope, from the signed-in demo account. */
export function useDemoReportScope(sample: ReportsSample): DemoReportScope {
  const { user } = useSession();
  return demoReportScope(sample, user.scope);
}

/** The scope sentence, worded as `scopeNoticeSentence` words it for a live viewer. */
export function demoScopeSentence(scope: DemoReportScope): string | null {
  if (scope.unrestricted) return null;
  const { locationNoun: noun, locationNounPlural: plural } = ACTIVE_BRAND.vocabulary;
  const count = scope.locationIds.length;
  const where = scope.label ? ` for ${scope.label}` : "";
  if (count === 0) return `Your account has no ${noun} assigned to it yet, so no ${noun} figures are shown${where}.`;
  return `Scoped to your assignment${where}: ${count} ${count === 1 ? noun : plural}. Figures on this page cover only those ${plural}.`;
}

export function DemoScopeNotice({ sample }: { sample: ReportsSample }) {
  const sentence = demoScopeSentence(useDemoReportScope(sample));
  return sentence ? <Notice>{sentence}</Notice> : null;
}

export function DemoDataNotice() {
  return (
    <Notice tone="accent" icon={<Info />} title="Demo data">
      Every sales, labor and Makery figure in Reports is invented for the demo. No {ACTIVE_BRAND.brandName} system was read.
    </Notice>
  );
}

export function DemoReportProvenance({ sample }: { sample: ReportsSample }) {
  return (
    <ProvenanceChips>
      <ProvenanceChip>Week ending {formatPeriodEnd(sample.periodEnd)}</ProvenanceChip>
      <ProvenanceChip>Demo data</ProvenanceChip>
    </ProvenanceChips>
  );
}

function useSelection(sample: ReportsSample) {
  const params = useSearchParams();
  const scope = useDemoReportScope(sample);
  const period = parseDemoPeriod(params.get("weeks"));
  const requested = params.get("store");
  const store = requested && scope.locationIds.includes(requested) ? requested : null;
  const locationIds = store ? [store] : [...scope.locationIds];
  return { params, scope, period, store, locationIds };
}

export function DemoReportFilters({ sample, base }: { sample: ReportsSample; base: string }) {
  const { params, scope, period, store } = useSelection(sample);
  const { apply, pending } = useQueryNavigation(base);
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    apply(next);
  };
  const stores = sample.stores.filter((s) => scope.locationIds.includes(s.id));
  return (
    <FilterRow pending={pending}>
      <SingleSelectMenu
        label="Period"
        options={DEMO_PERIOD_WEEKS.map((n) => ({ value: String(n), label: n === 1 ? "Last week" : `Last ${n} weeks` }))}
        selected={String(period)}
        onChange={(value) => set("weeks", value === "4" ? null : value)}
        pending={pending}
      />
      <SingleSelectMenu
        label="Store"
        options={
          stores.length === 1
            ? [{ value: "all", label: stores[0]!.name }]
            : [{ value: "all", label: `All ${stores.length} ${ACTIVE_BRAND.vocabulary.locationNounPlural}` }, ...stores.map((s) => ({ value: s.id, label: s.name }))]
        }
        selected={store ?? "all"}
        onChange={(value) => set("store", value === "all" ? null : value)}
        pending={pending}
      />
    </FilterRow>
  );
}

function useSorted(rows: StoreTotals[], value: Record<string, (row: StoreTotals) => number | string>, fallback: string) {
  const params = useSearchParams();
  const key = params.get("sort") && value[params.get("sort")!] ? params.get("sort")! : fallback;
  const direction: "asc" | "desc" = params.get("dir") === "asc" ? "asc" : key === "store" ? "asc" : "desc";
  const sorted = [...rows].sort((a, b) => {
    const x = value[key]!(a);
    const y = value[key]!(b);
    const c = typeof x === "string" ? x.localeCompare(String(y)) : x - Number(y);
    return direction === "asc" ? c : -c;
  });
  const sortHref = (field: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("sort", field);
    next.set("dir", field === key && direction === "desc" ? "asc" : "desc");
    return `?${next.toString()}`;
  };
  return { sorted, key, direction, sortHref };
}

export function DemoReportBody({ reportId, sample }: { reportId: string; sample: ReportsSample }) {
  const { scope, period, locationIds } = useSelection(sample);
  const sentence = demoScopeSentence(scope);
  const rows = storeTotals(sample, locationIds, period);
  const total = sumWeeks(sample.weeks.filter((w) => locationIds.includes(w.locationId) && weekStarts(sample).slice(0, period).includes(w.weekStart)));
  const series = weeklySeries(sample, locationIds, 13).map((w) => ({
    week: weekLabel(w.weekStart),
    netSales: w.netSales,
    lastYear: w.lastYearNetSales,
    laborPct: ratio(w.laborCost, w.netSales) === null ? 0 : Math.round(ratio(w.laborCost, w.netSales)! * 1000) / 10,
  }));
  const window = period === 1 ? "last week" : `the last ${period} weeks`;

  return (
    <>
      <DemoDataNotice />
      {sentence ? <Notice>{sentence}</Notice> : null}
      {locationIds.length === 0 ? null : reportId === "labor-productivity" ? (
        <LaborView rows={rows} total={total} series={series} window={window} />
      ) : (
        <SalesView rows={rows} total={total} series={series} window={window} />
      )}
    </>
  );
}

type Total = ReturnType<typeof sumWeeks>;
type Point = { week: string; netSales: number; lastYear: number; laborPct: number };

function SalesView({ rows, total, series, window }: { rows: StoreTotals[]; total: Total; series: Point[]; window: string }) {
  const yoy = ratio(total.netSales - total.lastYearNetSales, total.lastYearNetSales);
  const cards: KpiCard[] = [
    { id: "net", label: "Net sales", value: money(total.netSales), helper: `Across ${rows.length} ${rows.length === 1 ? "store" : "stores"}, ${window}.`, changeLabel: signed(yoy), trend: trendFor(yoy === null ? null : yoy * 100), emphasis: true },
    { id: "txn", label: "Transactions", value: total.transactions.toLocaleString("en-US"), helper: "Completed sales at the register." },
    { id: "ticket", label: "Average ticket", value: money2(ratio(total.netSales, total.transactions)), helper: "Net sales per transaction." },
    { id: "upt", label: "Units per transaction", value: ratio(total.units, total.transactions)?.toFixed(2) ?? null, helper: "Items in the average basket." },
  ];
  const value: Record<string, (r: StoreTotals) => number | string> = {
    store: (r) => r.name,
    net: (r) => r.netSales,
    yoy: (r) => ratio(r.netSales - r.lastYearNetSales, r.lastYearNetSales) ?? 0,
    txn: (r) => r.transactions,
    ticket: (r) => ratio(r.netSales, r.transactions) ?? 0,
    upt: (r) => ratio(r.units, r.transactions) ?? 0,
  };
  const { sorted, key, direction, sortHref } = useSorted(rows, value, "net");
  const columns: TableColumn<StoreTotals>[] = [
    { key: "store", label: "Store", render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
    { key: "net", label: "Net sales", align: "right", render: (r) => money(r.netSales) },
    { key: "yoy", label: "vs last year", align: "right", render: (r) => signedPct(ratio(r.netSales - r.lastYearNetSales, r.lastYearNetSales)) },
    { key: "txn", label: "Transactions", align: "right", render: (r) => r.transactions.toLocaleString("en-US") },
    { key: "ticket", label: "Avg ticket", align: "right", render: (r) => money2(ratio(r.netSales, r.transactions)) },
    { key: "upt", label: "UPT", hint: "Units per transaction", align: "right", render: (r) => ratio(r.units, r.transactions)?.toFixed(2) ?? "—" },
  ];
  return (
    <>
      <KpiCardRow cards={cards} />
      <ChartFrame title="Weekly net sales" description="The last 13 weeks against the same weeks last year.">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis {...AXIS_PROPS} dataKey="week" minTickGap={18} />
            <YAxis {...AXIS_PROPS} width={56} domain={["auto", "auto"]} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
            <RechartsTooltip content={<ChartTooltip formatter={(v) => money(v)} />} />
            <Line type="monotone" dataKey="netSales" name="This year" stroke={CHART_COLORS.primary} strokeWidth={2.25} dot={false} />
            <Line type="monotone" dataKey="lastYear" name="Last year" stroke={CHART_COLORS.slate} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
      <ChartLegend items={[{ label: "This year", color: CHART_COLORS.primary }, { label: "Last year", color: CHART_COLORS.slate }]} className="-mt-3" />
      <ReportDetailSection defaultOpen title="By store" description={`Each store's figures for ${window}.`}>
        <BedSpaDataTable
          rows={sorted}
          columns={columns}
          rowKey={(r) => r.locationId}
          sort={key}
          direction={direction}
          sortHref={sortHref}
          minWidth={720}
          footer={rows.length > 1 ? { store: "All stores", net: money(total.netSales), yoy: signedPct(yoy), txn: total.transactions.toLocaleString("en-US"), ticket: money2(ratio(total.netSales, total.transactions)), upt: ratio(total.units, total.transactions)?.toFixed(2) } : undefined}
        />
      </ReportDetailSection>
    </>
  );
}

function LaborView({ rows, total, series, window }: { rows: StoreTotals[]; total: Total; series: Point[]; window: string }) {
  const laborPct = ratio(total.laborCost, total.netSales);
  const cards: KpiCard[] = [
    { id: "pct", label: "Labor % of sales", value: pct(laborPct), helper: `Labor cost over net sales, ${window}. Target 20%.`, changeLabel: laborPct === null ? undefined : `${laborPct <= 0.2 ? "Under" : "Over"} target by ${Math.abs((laborPct - 0.2) * 100).toFixed(1)} pts`, trend: laborPct !== null && laborPct > 0.2 ? "down" : "flat", emphasis: true },
    { id: "splh", label: "Sales per labor hour", value: money2(ratio(total.netSales, total.laborHours)), helper: "Net sales for every hour worked." },
    { id: "hours", label: "Labor hours", value: total.laborHours.toLocaleString("en-US"), helper: "Hours worked by store teams." },
    { id: "makery", label: "Makery guests", value: total.makeryGuests.toLocaleString("en-US"), helper: "Guests at Makery classes and parties." },
  ];
  const value: Record<string, (r: StoreTotals) => number | string> = {
    store: (r) => r.name,
    net: (r) => r.netSales,
    hours: (r) => r.laborHours,
    pct: (r) => ratio(r.laborCost, r.netSales) ?? 0,
    splh: (r) => ratio(r.netSales, r.laborHours) ?? 0,
    makery: (r) => r.makeryGuests,
  };
  const { sorted, key, direction, sortHref } = useSorted(rows, value, "pct");
  const columns: TableColumn<StoreTotals>[] = [
    { key: "store", label: "Store", render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
    { key: "net", label: "Net sales", align: "right", render: (r) => money(r.netSales) },
    { key: "hours", label: "Labor hours", align: "right", render: (r) => r.laborHours.toLocaleString("en-US") },
    {
      key: "pct",
      label: "Labor %",
      hint: "Target 20%",
      align: "right",
      render: (r) => {
        const p = ratio(r.laborCost, r.netSales);
        return <span className={p !== null && p > 0.2 ? "font-semibold text-measure-flagged-foreground" : undefined}>{pct(p)}</span>;
      },
    },
    { key: "splh", label: "Sales / labor hr", align: "right", render: (r) => money2(ratio(r.netSales, r.laborHours)) },
    { key: "makery", label: "Makery guests", align: "right", render: (r) => r.makeryGuests.toLocaleString("en-US") },
  ];
  const byStore = rows.map((r) => ({ name: r.name.replace(/ \(.*\)$/, ""), pct: Math.round((ratio(r.laborCost, r.netSales) ?? 0) * 1000) / 10 }));
  return (
    <>
      <KpiCardRow cards={cards} />
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartFrame title="Labor % by week" description="Labor cost over net sales, the last 13 weeks.">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis {...AXIS_PROPS} dataKey="week" minTickGap={18} />
              <YAxis {...AXIS_PROPS} width={44} domain={[12, 28]} ticks={[12, 16, 20, 24, 28]} tickFormatter={(v: number) => `${v}%`} />
              <RechartsTooltip content={<ChartTooltip formatter={(v) => `${v.toFixed(1)}%`} />} />
              <Line type="monotone" dataKey="laborPct" name="Labor %" stroke={CHART_COLORS.primary} strokeWidth={2.25} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
        <ChartFrame title="Labor % by store" description={`For ${window}. The 20% target is the line to beat.`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byStore} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
              <CartesianGrid {...GRID_PROPS} horizontal={false} vertical />
              <XAxis {...AXIS_PROPS} type="number" domain={[0, 30]} tickFormatter={(v: number) => `${v}%`} />
              <YAxis {...AXIS_PROPS} type="category" dataKey="name" width={118} />
              <RechartsTooltip content={<ChartTooltip formatter={(v) => `${v.toFixed(1)}%`} />} />
              <Bar dataKey="pct" name="Labor %" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>
      <ReportDetailSection defaultOpen title="By store" description={`Each store's labor for ${window}.`}>
        <BedSpaDataTable
          rows={sorted}
          columns={columns}
          rowKey={(r) => r.locationId}
          sort={key}
          direction={direction}
          sortHref={sortHref}
          minWidth={720}
          footer={rows.length > 1 ? { store: "All stores", net: money(total.netSales), hours: total.laborHours.toLocaleString("en-US"), pct: pct(laborPct), splh: money2(ratio(total.netSales, total.laborHours)), makery: total.makeryGuests.toLocaleString("en-US") } : undefined}
        />
      </ReportDetailSection>
    </>
  );
}
