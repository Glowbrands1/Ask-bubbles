import { reviewDate, rating } from "@/features/admin/google-reviews/format";
import { APPROVED_GOOGLE_STORES } from "@/config/company/google-reviews";
import type {
  MonthlyPoint,
  ReviewRow,
  StoreSummary,
} from "@/lib/google-reviews/views";

import type { ReviewsData } from "./load";
import type { ReviewsTab } from "./reviews-tabs";

const SELECT =
  "h-[34px] rounded-[22px] border border-border-strong bg-surface px-3 text-[11.5px] font-bold text-foreground shadow-soft";

export function Figure({ children }: { children: React.ReactNode }) {
  return (
    <p className="display-figure text-[26px] leading-tight text-foreground">
      {children}
    </p>
  );
}

const sum = (
  stores: readonly StoreSummary[],
  pick: (s: StoreSummary) => number,
) => stores.reduce((a, s) => a + pick(s), 0);

export function totals(stores: readonly StoreSummary[]) {
  const reviews = sum(stores, (s) => s.reviewCount);
  const weighted = sum(stores, (s) => (s.averageRating ?? 0) * s.reviewCount);
  return { reviews, average: reviews > 0 ? weighted / reviews : null };
}

/** The filter strip's live controls: a plain GET form, so filters work without scripting. */
export function LiveFilters({
  tab,
  data,
}: {
  tab: ReviewsTab;
  data: ReviewsData;
}) {
  const { query } = data;
  return (
    <form
      method="get"
      action="/reviews"
      className="flex flex-wrap items-center gap-2"
      aria-label="Review filters"
    >
      {tab !== "overview" ? (
        <input type="hidden" name="tab" value={tab} />
      ) : null}
      {tab === "leaderboard" && data.rank === "week" ? (
        <input type="hidden" name="rank" value="week" />
      ) : null}
      <select
        name="store"
        defaultValue={query.store ?? ""}
        aria-label="Location"
        className={SELECT}
      >
        <option value="">All locations</option>
        {APPROVED_GOOGLE_STORES.map((s) => (
          <option key={s.code} value={s.code}>
            {data.stores.find((x) => x.storeCode === s.code)?.displayName ??
              s.code}
          </option>
        ))}
      </select>
      {tab === "reviews" ? (
        <>
          <select
            name="rating"
            defaultValue={query.rating ?? ""}
            aria-label="Rating"
            className={SELECT}
          >
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} ★
              </option>
            ))}
          </select>
          <select
            name="reply"
            defaultValue={query.reply ?? ""}
            aria-label="Response"
            className={SELECT}
          >
            <option value="">All responses</option>
            <option value="answered">Answered</option>
            <option value="unanswered">Unanswered</option>
          </select>
          <input
            type="date"
            name="from"
            defaultValue={query.from ?? ""}
            aria-label="From date"
            className={SELECT}
          />
          <input
            type="date"
            name="to"
            defaultValue={query.to ?? ""}
            aria-label="To date"
            className={SELECT}
          />
        </>
      ) : null}
      <button
        type="submit"
        className={`${SELECT} cursor-pointer bg-selected text-selected-foreground`}
      >
        Apply
      </button>
    </form>
  );
}

export function RatingsPanel({
  stores,
  store,
}: {
  stores: StoreSummary[];
  store: string | null;
}) {
  const scoped = store ? stores.filter((s) => s.storeCode === store) : stores;
  const counts = [5, 4, 3, 2, 1].map((n) => ({
    n,
    c: sum(scoped, (s) => s.ratings[n - 1]!),
  }));
  const total = counts.reduce((a, r) => a + r.c, 0) || 1;
  return (
    <ul className="flex flex-col gap-2 px-4 py-4">
      {counts.map(({ n, c }) => (
        <li key={n} className="flex items-center gap-3 text-[12px]">
          <span className="w-8 font-bold">{n} ★</span>
          <span
            aria-hidden
            className="h-2 min-w-0 flex-1 rounded-[4px] bg-surface-muted"
          >
            <span
              className="block h-2 rounded-[4px] bg-measure-data"
              style={{ width: `${(c / total) * 100}%` }}
            />
          </span>
          <span className="w-12 text-right font-bold tabular-nums">{c}</span>
        </li>
      ))}
    </ul>
  );
}

const MONTH = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});

export function TrendPanel({ trend }: { trend: MonthlyPoint[] }) {
  const max = Math.max(1, ...trend.map((p) => p.reviewCount));
  return (
    <div className="scroll-slim max-h-80 overflow-y-auto">
      <table
        aria-label="Google Reviews by month"
        className="w-full border-collapse text-left text-[12px]"
      >
        <thead>
          <tr className="border-b border-border bg-surface-muted text-[8px] font-black tracking-[0.14em] text-subtle-foreground uppercase">
            <th scope="col" className="px-4 py-2.5">
              Month
            </th>
            <th scope="col" className="px-4 py-2.5 text-right">
              Reviews
            </th>
            <th scope="col" className="px-4 py-2.5 text-right">
              Average
            </th>
            <th scope="col" className="w-1/2 px-4 py-2.5">
              <span className="sr-only">Volume</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {[...trend].reverse().map((p) => (
            <tr key={p.month} className="border-b border-border-hairline">
              <td className="px-4 py-2 font-bold">
                {MONTH.format(new Date(`${p.month}T00:00:00Z`))}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {p.reviewCount}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {rating(p.averageRating)}
              </td>
              <td className="px-4 py-2">
                <span
                  aria-hidden
                  className="block h-2 rounded-[4px] bg-measure-data"
                  style={{ width: `${(p.reviewCount / max) * 100}%` }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function pageHref(data: ReviewsData, page: number): string {
  const q = data.query;
  const p = new URLSearchParams({ tab: "reviews" });
  if (q.store) p.set("store", q.store);
  if (q.rating) p.set("rating", String(q.rating));
  if (q.reply) p.set("reply", q.reply);
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  p.set("page", String(page));
  return `/reviews?${p.toString()}`;
}

export function ReviewsList({ data }: { data: ReviewsData }) {
  const page = data.page;
  if (!page) return null;
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  return (
    <>
      <div className="scroll-slim w-full min-w-0 overflow-x-auto">
        <table
          aria-label="Google reviews"
          className="w-full min-w-[44rem] border-collapse text-left text-[12px]"
        >
          <thead>
            <tr className="border-b border-border bg-surface-muted text-[8px] font-black tracking-[0.14em] text-subtle-foreground uppercase">
              <th scope="col" className="px-4 py-2.5">
                Date
              </th>
              <th scope="col" className="px-4 py-2.5">
                Salon
              </th>
              <th scope="col" className="px-4 py-2.5">
                Reviewer
              </th>
              <th scope="col" className="px-4 py-2.5">
                Rating
              </th>
              <th scope="col" className="px-4 py-2.5">
                Review
              </th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((r: ReviewRow) => (
              <tr
                key={r.id}
                className="border-b border-border-hairline align-top"
              >
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {reviewDate(r.createdAt)}
                </td>
                <td className="px-4 py-2.5">{r.storeName}</td>
                <td className="px-4 py-2.5">{r.reviewerName ?? "Anonymous"}</td>
                <td className="px-4 py-2.5 font-bold whitespace-nowrap">
                  {r.starRating} ★
                </td>
                <td className="px-4 py-2.5">
                  {r.comment ?? (
                    <span className="text-muted-foreground">No comment</span>
                  )}
                  {r.replyComment ? (
                    <p className="mt-1.5 border-l-2 border-border-strong pl-2.5 text-[11.5px] text-muted-foreground">
                      <span className="font-bold">
                        Owner reply
                        {r.replyUpdatedAt
                          ? ` · ${reviewDate(r.replyUpdatedAt)}`
                          : ""}
                        :
                      </span>{" "}
                      {r.replyComment}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {page.rows.length === 0 ? (
        <p className="py-7 text-center text-[13px] font-bold text-muted-foreground">
          No reviews match these filters
        </p>
      ) : null}
      <nav
        aria-label="Pages"
        className="flex items-center justify-between border-t border-border-hairline px-4 py-3 text-[11.5px] text-muted-foreground"
      >
        <span>
          {page.total} reviews · page {page.page} of {pages}
        </span>
        <span className="flex gap-3 font-bold">
          {page.page > 1 ? (
            <a href={pageHref(data, page.page - 1)}>Previous</a>
          ) : null}
          {page.page < pages ? (
            <a href={pageHref(data, page.page + 1)}>Next</a>
          ) : null}
        </span>
      </nav>
    </>
  );
}

/* ------------------------------------------------------------------ goals -- */

import {
  GOAL_STATUS_LABEL,
  goalProgress,
  goalStatus,
  baselineDay,
  isPartialMonth,
  partialMonthNote,
  goalSummary,
  rankRows,
  type GoalRow,
  type GoalStatus,
  type GoalSummary,
} from "@/lib/google-reviews/goals";
import { cn } from "@/lib/utils/cn";
import { reviewsTabHref } from "./reviews-tabs";

/** Goal rows in view (the Location filter narrows them) and their totals, or null while no salon has a baseline. */
export function goalView(data: ReviewsData | null): { rows: GoalRow[]; summary: GoalSummary; context: NonNullable<ReviewsData["goals"]>["context"] } | null {
  if (!data?.goals) return null;
  const rows = data.query.store ? data.goals.rows.filter((r) => r.storeCode === data.query.store) : data.goals.rows;
  const summary = goalSummary(rows);
  return summary.counting > 0 ? { rows, summary, context: data.goals.context } : null;
}

const STATUS_STYLE: Record<GoalStatus, string> = {
  met: "bg-status-outperforming text-white",
  partial_month: "bg-surface-muted text-body-foreground",
  on_pace: "bg-selected text-selected-foreground",
  behind_pace: "bg-status-attention text-white",
  not_counting: "bg-surface-muted text-muted-foreground",
};

function StatusChip({ status }: { status: GoalStatus }) {
  return <span className={cn("inline-flex rounded-[22px] px-2.5 py-[3px] text-[10.5px] font-bold whitespace-nowrap", STATUS_STYLE[status])}>{GOAL_STATUS_LABEL[status]}</span>;
}

function Meter({ row }: { row: GoalRow }) {
  const p = goalProgress(row.qualifyingMonthToDate, row.monthlyTarget);
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden className="h-2 min-w-[6rem] flex-1 rounded-[4px] bg-surface-muted">
        <span className={cn("block h-2 rounded-[4px]", p.percent >= 100 ? "bg-status-outperforming" : "bg-measure-data")} style={{ width: `${p.barPercent}%` }} />
      </span>
      <span className="w-14 text-right text-[11.5px] font-bold tabular-nums">
        {p.percent}%{p.over > 0 ? <span className="block text-[10px] font-normal text-muted-foreground">+{p.over} over</span> : null}
      </span>
    </div>
  );
}

export function GoalTable({ rows, context }: { rows: GoalRow[]; context: NonNullable<ReviewsData["goals"]>["context"] }) {
  return (
    <div className="scroll-slim w-full min-w-0 overflow-x-auto">
      <table aria-label="Salon goal progress" className="w-full min-w-[44rem] border-collapse text-left text-[12px]">
        <thead>
          <tr className="border-b border-border bg-surface-muted text-[8px] font-black tracking-[0.14em] text-subtle-foreground uppercase">
            <th scope="col" className="px-4 py-2.5">Salon</th>
            <th scope="col" className="px-4 py-2.5 text-right">Store code</th>
            <th scope="col" className="px-4 py-2.5 text-right">Qualifying · this week</th>
            <th scope="col" className="px-4 py-2.5 text-right">Qualifying · month to date</th>
            <th scope="col" className="px-4 py-2.5 text-right">Monthly target</th>
            <th scope="col" className="px-4 py-2.5">Progress toward target</th>
            <th scope="col" className="px-4 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const counting = r.baselineReviewId !== null;
            return (
              <tr key={r.storeCode} className="border-b border-border-hairline">
                <td className="px-4 py-2.5 font-bold">
                  {r.displayName}
                  {r.baselineReviewTime ? (
                    <span className="block text-[10.5px] font-normal text-muted-foreground">
                      Counting since {formatDay(baselineDay(r))}
                      {isPartialMonth(r, context) ? " · partial month" : ""}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.storeCode}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{counting ? r.qualifyingThisWeek : "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{counting ? r.qualifyingMonthToDate : "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.monthlyTarget}</td>
                <td className="px-4 py-2.5">{counting ? <Meter row={r} /> : <span className="text-muted-foreground">No baseline yet</span>}</td>
                <td className="px-4 py-2.5"><StatusChip status={goalStatus(r, context)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function rankHref(data: ReviewsData, metric: "month" | "week"): string {
  const p = new URLSearchParams();
  if (data.query.store) p.set("store", data.query.store);
  if (metric === "week") p.set("rank", "week");
  const qs = p.toString();
  const base = reviewsTabHref("leaderboard");
  return qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base;
}

export function RankSegments({ data }: { data: ReviewsData }) {
  const options = [
    { key: "month" as const, label: "Rank by month to date" },
    { key: "week" as const, label: "Rank by this week" },
  ];
  return (
    <div role="group" aria-label="Rank by" className="inline-flex rounded-[22px] border border-border-strong bg-surface p-0.5 shadow-soft">
      {options.map((o) => (
        <a
          key={o.key}
          href={rankHref(data, o.key)}
          aria-current={data.rank === o.key ? "true" : undefined}
          className={cn("rounded-[20px] px-3 py-[5px] text-[11.5px] font-bold whitespace-nowrap", data.rank === o.key ? "bg-selected text-selected-foreground" : "text-muted-foreground")}
        >
          {o.label}
        </a>
      ))}
    </div>
  );
}

export function Leaderboard({ rows, context, metric }: { rows: GoalRow[]; context: NonNullable<ReviewsData["goals"]>["context"]; metric: "month" | "week" }) {
  const ranked = rankRows(rows, metric);
  return (
    <ol className="divide-y divide-border-hairline">
      {ranked.map(({ row, rank, tied }) => (
        <li key={row.storeCode} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 px-4 py-3 text-[12px] lg:grid-cols-[3.5rem_minmax(0,1.6fr)_6rem_7rem_minmax(0,2fr)_8rem]">
          <span className="font-black tabular-nums">{rank === null ? "—" : `${tied ? "T" : ""}${rank}`}</span>
          <span className="font-bold">
            {row.displayName} <span className="font-normal text-muted-foreground">#{row.storeCode}</span>
          </span>
          <span className="text-right tabular-nums">{row.baselineReviewId ? row.qualifyingThisWeek : "—"}</span>
          <span className="text-right tabular-nums">{row.baselineReviewId ? row.qualifyingMonthToDate : "—"}</span>
          <span>{row.baselineReviewId ? <Meter row={row} /> : <span className="text-muted-foreground">No baseline yet</span>}</span>
          <span><StatusChip status={goalStatus(row, context)} /></span>
        </li>
      ))}
    </ol>
  );
}

const DAY_LABEL = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export function formatDay(day: string | null): string {
  return day ? DAY_LABEL.format(new Date(`${day}T00:00:00Z`)) : "—";
}

/** The honest caveat for a month whose baselines were set part-way through; null when every salon has a full month. */
export function partialMonthText(g: ReturnType<typeof goalView>): string | null {
  if (!g) return null;
  const note = partialMonthNote(g.rows, g.context);
  if (!note) return null;
  const span = note.from === note.to ? formatDay(note.from) : `${formatDay(note.from)}–${formatDay(note.to)}`;
  return `Partial month: counting for ${note.salons} salon${note.salons === 1 ? "" : "s"} began ${span}, so this month's totals cover only part of it. Salons short of target show "Partial month" rather than a pace verdict, and "reviews still needed" is measured against the full monthly target.`;
}
