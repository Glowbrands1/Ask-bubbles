import Link from "next/link";

import { lastFullMonths } from "@/lib/google-reviews/quick-ranges";
import type { MonthlyProgress, MonthlyStoreRow } from "@/lib/google-reviews/monthly-progress";
import { cn } from "@/lib/utils/cn";

/**
 * ============================================================================
 * MONTH BY MONTH — QUALIFYING REVIEWS PER STORE, WITH L3, L6 AND YTD
 * ============================================================================
 *
 * Ported from Ask Sunny: "yeah per month pls last 3 mos last 6 mos and YTD".
 * One column per month, then the three totals; each month is the goal table's
 * own figure for that month (see `lib/google-reviews/monthly-progress.ts`).
 * Every total links to the Reviews view over the same dates (the L3 / L6 / YTD
 * presets), so a manager can read the reviews behind it.
 */

const TH = "px-3 py-2.5 text-[11px] font-bold tracking-wide text-muted-foreground uppercase";

const MONTH = (month: string, withYear: boolean) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

function span(months: readonly string[]): string {
  if (months.length === 0) return "none yet";
  const first = months[0]!;
  const last = months[months.length - 1]!;
  if (first === last) return MONTH(first, true);
  return `${MONTH(first, first.slice(0, 4) !== last.slice(0, 4))} – ${MONTH(last, true)}`;
}

function reviewsHref(store: string | null, from: string, to: string): string {
  const p = new URLSearchParams({ tab: "reviews" });
  if (store) p.set("store", store);
  p.set("from", from);
  p.set("to", to);
  return `/reviews?${p.toString()}`;
}

export function MonthlyTable({
  monthly,
  store,
  today,
}: {
  monthly: MonthlyProgress;
  /** The location filter in force, if any. */
  store: string | null;
  /** Central `yyyy-mm-dd`. */
  today: string;
}) {
  const rows = store ? monthly.rows.filter((r) => r.storeCode === store) : monthly.rows;
  const firstYear = monthly.months[0]!.slice(0, 4);
  const l3 = lastFullMonths(3, today);
  const l6 = lastFullMonths(6, today);
  const totals = [
    { key: "l3" as const, label: "L3", detail: span(monthly.l3Months), ...l3 },
    { key: "l6" as const, label: "L6", detail: span(monthly.l6Months), ...l6 },
    {
      key: "ytd" as const,
      label: "YTD",
      detail: `${span(monthly.ytdMonths)}, to date`,
      from: `${today.slice(0, 4)}-01-01`,
      to: today,
    },
  ];

  const cells = (row: MonthlyStoreRow, code: string | null, counting: boolean) => (
    <>
      {row.months.map((count, i) => (
        <td key={monthly.months[i]} className="px-3 py-3 text-right tabular-nums">
          {counting ? (
            <span
              className={cn(
                count >= row.monthlyTarget && row.monthlyTarget > 0 ? "font-black text-foreground" : "text-foreground",
                count === 0 && "text-muted-foreground",
              )}
            >
              {count}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      ))}
      {totals.map((t) => (
        <td key={t.key} className="px-3 py-3 text-right tabular-nums">
          {counting ? (
            <Link href={reviewsHref(code, t.from, t.to)} className="text-[13px] font-black text-foreground hover:underline">
              {row[t.key]}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      ))}
    </>
  );

  const counted = rows.filter((r) => r.counting);
  const sum = (pick: (r: MonthlyStoreRow) => number) => counted.reduce((n, r) => n + pick(r), 0);
  const total: MonthlyStoreRow = {
    storeCode: "all",
    displayName: "All stores shown",
    monthlyTarget: 0,
    counting: true,
    months: monthly.months.map((_, i) => sum((r) => r.months[i]!)),
    l3: sum((r) => r.l3),
    l6: sum((r) => r.l6),
    ytd: sum((r) => r.ytd),
  };

  return (
    <div className="scroll-slim w-full min-w-0 overflow-x-auto">
      <table aria-label="Qualifying reviews by month" className="w-full min-w-[60rem] border-collapse text-left text-[12px]">
        <thead>
          <tr className="border-b border-border bg-surface-muted">
            <th scope="col" className={TH}>
              Store
            </th>
            {monthly.months.map((month) => (
              <th key={month} scope="col" className={cn(TH, "text-right")}>
                {MONTH(month, month === monthly.months[0] || month.slice(0, 4) !== firstYear)}
                {month === monthly.currentMonth ? (
                  <span className="block text-[10px] font-normal normal-case">to date</span>
                ) : null}
              </th>
            ))}
            {totals.map((t) => (
              <th key={t.key} scope="col" className={cn(TH, "text-right text-foreground")}>
                {t.label}
                <span className="block text-[10px] font-normal text-muted-foreground normal-case">{t.detail}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.storeCode} className="border-b border-border-hairline even:bg-surface-muted/40">
              <th scope="row" className="px-4 py-3 text-left font-bold">
                {r.displayName}
                <span className="block text-[10.5px] font-normal text-muted-foreground">
                  {r.storeCode}
                  {r.counting ? "" : " · not counting"}
                </span>
              </th>
              {cells(r, r.storeCode, r.counting)}
            </tr>
          ))}
        </tbody>
        {rows.length > 1 ? (
          <tfoot>
            <tr className="border-t border-border bg-surface-muted">
              <th scope="row" className="px-4 py-3 text-left font-black">
                All stores shown
              </th>
              {cells(total, null, true)}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
