import Link from "next/link";
import {
  Check,
  CornerDownRight,
  Minus,
  Search,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { reviewDate, rating } from "@/features/admin/google-reviews/format";
import { APPROVED_GOOGLE_STORES } from "@/config/company/google-reviews";
import {
  GOAL_STATUS_LABEL,
  GOAL_TONE,
  baselineDay,
  goalProgress,
  goalStatus,
  goalSummary,
  isCounting,
  isPartialMonth,
  paceMarkPercent,
  partialMonthNote,
  rankRows,
  reviewEligibility,
  type GoalRow,
  type GoalStatus,
  type GoalSummary,
  type GoalTone,
  type ReviewEligibility,
} from "@/lib/google-reviews/goals";
import type {
  PeriodPoint,
  PeriodUnit,
  ReviewRow,
  StoreSummary,
} from "@/lib/google-reviews/views";
import { cn } from "@/lib/utils/cn";

import { monthOptions, type ReviewsData } from "./load";
import { reviewsTabHref, type ReviewsTab } from "./reviews-tabs";

type GoalContextOf = NonNullable<ReviewsData["goals"]>["context"];

const MONTH_NAME_LONG = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
/** "September 2026" for `2026-09`. */
export const monthName = (month: string): string =>
  MONTH_NAME_LONG.format(new Date(`${month}-01T00:00:00Z`));

const SELECT =
  "h-[34px] rounded-[22px] border border-border-strong bg-surface px-3 text-[11.5px] font-bold text-foreground shadow-soft transition-colors hover:border-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent";

const TH =
  "px-4 py-2.5 text-[8px] font-black tracking-[0.14em] whitespace-nowrap text-subtle-foreground uppercase";

export function Figure({ children }: { children: React.ReactNode }) {
  return (
    <p className="display-figure text-[30px] leading-tight text-foreground">
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

/* ---------------------------------------------------------------- filters -- */

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
      {tab === "overview" && data.period === "week" ? (
        <input type="hidden" name="period" value="week" />
      ) : null}
      {data.goalFilter?.q ? (
        <input type="hidden" name="q" value={data.goalFilter.q} />
      ) : null}
      {data.goalFilter?.status ? (
        <input type="hidden" name="status" value={data.goalFilter.status} />
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
              s.code}{" "}
            · #{s.code}
          </option>
        ))}
      </select>
      {tab === "leaderboard" ? (
        <select
          name="month"
          defaultValue={data.month ?? monthOptions()[0]}
          aria-label="Month"
          className={SELECT}
        >
          {monthOptions().map((m, i) => (
            <option key={m} value={m}>
              {monthName(m)}
              {i === 0 ? " (current)" : ""}
            </option>
          ))}
        </select>
      ) : null}
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
        className={`${SELECT} cursor-pointer !border-selected !bg-selected !text-selected-foreground hover:!bg-selected-hover`}
      >
        Apply
      </button>
    </form>
  );
}

/** Search box for the goal table / leaderboard: a GET form that keeps every other filter in the URL. */
export function GoalSearch({
  data,
  tab,
  placeholder,
}: {
  data: ReviewsData;
  tab: ReviewsTab;
  placeholder: string;
}) {
  return (
    <form
      method="get"
      action="/reviews"
      role="search"
      aria-label={placeholder}
      className="relative w-full min-w-0 sm:w-64"
    >
      {tab !== "overview" ? (
        <input type="hidden" name="tab" value={tab} />
      ) : null}
      {data.query.store ? (
        <input type="hidden" name="store" value={data.query.store} />
      ) : null}
      {tab === "leaderboard" && data.rank === "week" ? (
        <input type="hidden" name="rank" value="week" />
      ) : null}
      {tab === "overview" && data.period === "week" ? (
        <input type="hidden" name="period" value="week" />
      ) : null}
      {data.goalFilter?.status ? (
        <input type="hidden" name="status" value={data.goalFilter.status} />
      ) : null}
      {tab === "leaderboard" &&
      data.month &&
      data.month !== monthOptions()[0] ? (
        <input type="hidden" name="month" value={data.month} />
      ) : null}
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        name="q"
        defaultValue={data.goalFilter?.q ?? ""}
        aria-label={placeholder}
        placeholder={placeholder}
        className="h-[34px] w-full rounded-[22px] border border-border-strong bg-surface pr-3.5 pl-8 text-[11.5px] text-foreground shadow-soft transition-colors placeholder:text-muted-foreground hover:border-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
      />
    </form>
  );
}

/* ------------------------------------------------------------------ ratings -- */

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
  const all = counts.reduce((a, r) => a + r.c, 0);
  const total = all || 1;
  return (
    <ul className="flex flex-col gap-2.5 px-4 py-4">
      {counts.map(({ n, c }) => (
        <li key={n} className="flex items-center gap-3 text-[12px]">
          <span className="flex w-9 items-center gap-1 font-bold">
            {n}
            <Star
              aria-hidden
              className="size-3 fill-review-star-fill text-review-star-edge"
            />
          </span>
          <span
            aria-hidden
            className={cn(
              "h-2.5 min-w-0 flex-1 rounded-full",
              n >= 3 ? "bg-measure-data-track" : "bg-tone-behind-soft",
            )}
          >
            <span
              className={cn(
                "block h-2.5 rounded-full transition-[width] duration-500",
                n >= 3 ? "bg-measure-data" : "bg-tone-behind",
              )}
              style={{
                width: `${c > 0 ? Math.max(1.5, (c / total) * 100) : 0}%`,
              }}
            />
          </span>
          <span className="w-10 text-right font-bold tabular-nums">{c}</span>
          <span className="w-9 text-right text-[11px] text-muted-foreground tabular-nums">
            {all > 0 ? `${Math.round((c / all) * 100)}%` : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------- over time -- */

const MONTH = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});

const WEEK_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

/** "Oct 12 – Oct 18, 2026" for a Monday start. */
function weekLabel(start: string): string {
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(from.getTime() + 6 * 86_400_000);
  return `${WEEK_DAY.format(from)} – ${WEEK_DAY.format(to)}, ${to.getUTCFullYear()}`;
}

function periodHref(data: ReviewsData, period: PeriodUnit): string {
  const p = new URLSearchParams();
  if (data.query.store) p.set("store", data.query.store);
  if (period === "week") p.set("period", "week");
  const qs = p.toString();
  return qs ? `/reviews?${qs}` : "/reviews";
}

const SEGMENT_GROUP =
  "inline-flex rounded-[22px] border border-border-strong bg-surface p-0.5 shadow-soft";
const SEGMENT =
  "rounded-[20px] px-3 py-[5px] text-[11.5px] font-bold whitespace-nowrap transition-colors";
const SEGMENT_ON = "bg-selected text-selected-foreground";
const SEGMENT_OFF =
  "text-muted-foreground hover:bg-brand-accent-soft hover:text-foreground";

/** The Weekly / Monthly switch for "Google Reviews over time": links that do not jump the page to the top. */
export function PeriodSegments({ data }: { data: ReviewsData }) {
  const options = [
    { key: "week" as const, label: "Weekly" },
    { key: "month" as const, label: "Monthly" },
  ];
  return (
    <div role="group" aria-label="Chart period" className={SEGMENT_GROUP}>
      {options.map((o) => (
        <Link
          key={o.key}
          href={periodHref(data, o.key)}
          scroll={false}
          aria-current={data.period === o.key ? "true" : undefined}
          className={cn(
            SEGMENT,
            data.period === o.key ? SEGMENT_ON : SEGMENT_OFF,
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

/** The last day (`yyyy-mm-dd`) of a Monday-start week or a month starting on `start`. */
function periodEnd(start: string, period: PeriodUnit): string {
  const from = new Date(`${start}T00:00:00Z`);
  const end =
    period === "week"
      ? new Date(from.getTime() + 6 * 86_400_000)
      : new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0));
  return end.toISOString().slice(0, 10);
}

/** The Central dates from which the stores in view start counting toward their goals. */
export interface CountingSpan {
  /** The first store to start counting. */
  earliest: string;
  /** The last store to start counting: from here on, every counting store is eligible. */
  latest: string;
}

export type GoalMarkKind = "none" | "before" | "partial" | "eligible";

/** Whether a trend period is before, across, or after the dates goal counting starts, with the words for it. */
export function goalMark(
  start: string,
  period: PeriodUnit,
  span: CountingSpan | string | null,
): { kind: GoalMarkKind; label: string } {
  if (!span) return { kind: "none", label: "Goal not configured" };
  const { earliest, latest } =
    typeof span === "string" ? { earliest: span, latest: span } : span;
  if (periodEnd(start, period) < earliest)
    return { kind: "before", label: "Before goal counting" };
  if (start >= latest)
    return { kind: "eligible", label: "Goal-eligible (3–5★)" };
  return {
    kind: "partial",
    label:
      earliest === latest
        ? `Counting from ${formatDay(latest)}`
        : `Counting from ${formatDay(earliest)}–${formatDay(latest)}`,
  };
}

const MARK_STYLE: Record<GoalMarkKind, string> = {
  eligible: "bg-tone-met-soft text-tone-met-ink",
  partial: "bg-tone-pace-soft text-tone-pace-ink",
  before: "bg-tone-idle-soft text-tone-idle-ink",
  none: "bg-tone-idle-soft text-tone-idle-ink",
};

/** The first and last date goal counting starts across the counting stores in view (latest goes with every store counting). */
export function goalStartSpan(
  g: ReturnType<typeof goalView>,
): CountingSpan | null {
  if (!g) return null;
  const days = g.rows
    .filter((r) => isCounting(r))
    .map((r) => baselineDay(r)!)
    .sort();
  return days.length === 0
    ? null
    : { earliest: days[0]!, latest: days[days.length - 1]! };
}

export function TrendPanel({
  trend,
  period,
  countingStart = null,
}: {
  trend: PeriodPoint[];
  period: PeriodUnit;
  /** Where counting starts for the stores in view; null when no store counts yet. */
  countingStart?: CountingSpan | string | null;
}) {
  const max = Math.max(1, ...trend.map((p) => p.reviewCount));
  const weekly = period === "week";
  return (
    <>
      <div className="scroll-slim max-h-[28rem] w-full min-w-0 overflow-auto">
        <table
          aria-label={
            weekly ? "Google Reviews by week" : "Google Reviews by month"
          }
          className="w-full min-w-[42rem] border-collapse text-left text-[12px]"
        >
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-surface-muted">
              <th scope="col" className={TH}>
                {weekly ? "Week (Mon–Sun)" : "Month"}
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                All reviews
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                3–5★ reviews
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                Average
              </th>
              <th scope="col" className={TH}>
                Goal
              </th>
              <th scope="col" className={cn(TH, "w-1/4 min-w-[8rem]")}>
                <span className="sr-only">Review volume</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {[...trend].reverse().map((p) => {
              const mark = goalMark(p.start, period, countingStart);
              return (
                <tr
                  key={p.start}
                  className="border-b border-border-hairline transition-colors even:bg-surface-muted/40 hover:bg-brand-accent-soft"
                >
                  <td className="px-4 py-2.5 font-bold whitespace-nowrap">
                    {weekly
                      ? weekLabel(p.start)
                      : MONTH.format(new Date(`${p.start}T00:00:00Z`))}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums">
                    {p.reviewCount}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {p.qualifyingCount}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      {rating(p.averageRating)}
                      <Star
                        aria-hidden
                        className="size-3 fill-review-star-fill text-review-star-edge"
                      />
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span
                      className={cn(
                        "inline-flex rounded-[22px] px-2.5 py-[3px] text-[10.5px] font-bold",
                        MARK_STYLE[mark.kind],
                      )}
                    >
                      {mark.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      aria-hidden
                      title={`${p.reviewCount} reviews, ${p.qualifyingCount} rated 3–5★`}
                      className="relative block h-2.5 rounded-full bg-measure-data-track"
                    >
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-brand-accent transition-[width] duration-500"
                        style={{ width: `${(p.reviewCount / max) * 100}%` }}
                      />
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-measure-data transition-[width] duration-500"
                        style={{ width: `${(p.qualifyingCount / max) * 100}%` }}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-hairline px-4 pt-3 text-[11px] text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-3.5 rounded-full bg-brand-accent"
          />
          All reviews
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-3.5 rounded-full bg-measure-data"
          />
          3–5★ reviews
        </li>
      </ul>
      <p className="px-4 pt-1.5 pb-3 text-[11px] leading-snug text-muted-foreground">
        By Google&rsquo;s original review date, Central time.{" "}
        {weekly
          ? "Weeks run Monday–Sunday; the latest 52 are shown."
          : "Calendar months."}{" "}
        &ldquo;All reviews&rdquo; is every live review in the period;
        &ldquo;3–5★ reviews&rdquo; is only the rating range and is not the goal
        count. The goal counts 3–5★ reviews created on or after each
        store&rsquo;s counting start date, as marked in the Goal column.
      </p>
    </>
  );
}

/* -------------------------------------------------------------- the reviews -- */

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

function Stars({ value }: { value: number }) {
  return (
    <span
      role="img"
      aria-label={`${value} out of 5 stars`}
      className="inline-flex gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn(
            "size-3.5",
            n <= value
              ? "fill-review-star-fill text-review-star-edge"
              : "fill-transparent text-border-strong",
          )}
        />
      ))}
    </span>
  );
}

const ELIGIBILITY: Record<ReviewEligibility, { label: string; style: string }> =
  {
    counts: { label: "Counts toward goal", style: "text-tone-met-ink" },
    low_rating: {
      label: "Does not count — 1–2★",
      style: "text-tone-behind-ink",
    },
    historical: {
      label: "Historical — not counted",
      style: "text-muted-foreground",
    },
    not_counting: {
      label: "Store not counting yet",
      style: "text-muted-foreground",
    },
  };

const initials = (name: string | null) =>
  (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

export function ReviewsList({ data }: { data: ReviewsData }) {
  const page = data.page;
  if (!page) return null;
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const goalRows = new Map(
    (data.goals?.rows ?? []).map((r) => [r.storeCode, r]),
  );
  return (
    <>
      <ul aria-label="Google reviews" className="flex flex-col gap-3 p-4">
        {page.rows.map((r: ReviewRow) => {
          const low = r.starRating <= 2;
          const eligibility =
            ELIGIBILITY[reviewEligibility(goalRows.get(r.storeCode), r)];
          return (
            <li
              key={r.id}
              className={cn(
                "rounded-[var(--radius-md)] border border-brand-accent/40 border-l-4 bg-chat-canvas p-4 shadow-soft transition-shadow hover:shadow-raised",
                low ? "border-l-tone-behind" : "border-l-brand-accent",
              )}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-accent-soft text-[11px] font-black text-brand-accent-soft-foreground"
                >
                  {initials(r.reviewerName)}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-black">
                    {r.reviewerName ?? "Anonymous reviewer"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.storeName} · #{r.storeCode}
                  </p>
                </div>
                <div className="ml-auto flex flex-col items-end gap-0.5">
                  <Stars value={r.starRating} />
                  <span className="text-[11px] text-muted-foreground">
                    {reviewDate(r.createdAt)}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-body-foreground">
                {r.comment ?? (
                  <span className="text-muted-foreground italic">
                    Rating only — no written comment.
                  </span>
                )}
              </p>
              {r.replyComment ? (
                <div className="mt-3 rounded-[var(--radius-sm)] bg-brand-accent-soft px-3 py-2.5 text-[11.5px] leading-snug text-body-foreground">
                  <p className="flex items-center gap-1.5 font-bold text-brand-accent-soft-foreground">
                    <CornerDownRight aria-hidden className="size-3" />
                    Owner reply
                    {r.replyUpdatedAt
                      ? ` · ${reviewDate(r.replyUpdatedAt)}`
                      : ""}
                  </p>
                  <p className="mt-1">{r.replyComment}</p>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold">
                <span className={eligibility.style}>{eligibility.label}</span>
                <span
                  className={cn(
                    "rounded-[22px] px-2 py-[2px] text-[10.5px]",
                    r.hasReply
                      ? "bg-tone-met-soft text-tone-met-ink"
                      : "bg-tone-pace-soft text-tone-pace-ink",
                  )}
                >
                  {r.hasReply ? "Answered" : "Awaiting reply"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {page.rows.length === 0 ? (
        <div className="px-4 pt-2 pb-8 text-center">
          <p className="text-[13px] font-bold text-foreground">
            No reviews match these filters
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Try a different location, rating or date range.{" "}
            <Link href="/reviews?tab=reviews" className="font-bold underline">
              Clear filters
            </Link>
          </p>
        </div>
      ) : null}
      <nav
        aria-label="Pages"
        className="flex items-center justify-between border-t border-border-hairline px-4 py-3 text-[11.5px] text-muted-foreground"
      >
        <span>
          {page.total} reviews · page {page.page} of {pages}
        </span>
        <span className="flex gap-2 font-bold">
          {page.page > 1 ? (
            <Link
              href={pageHref(data, page.page - 1)}
              className="rounded-[22px] border border-border-strong px-3 py-1 transition-colors hover:bg-brand-accent-soft"
            >
              Previous
            </Link>
          ) : null}
          {page.page < pages ? (
            <Link
              href={pageHref(data, page.page + 1)}
              className="rounded-[22px] border border-border-strong px-3 py-1 transition-colors hover:bg-brand-accent-soft"
            >
              Next
            </Link>
          ) : null}
        </span>
      </nav>
    </>
  );
}

/* ------------------------------------------------------------------ goals -- */

/** Goal rows in view (the Location filter narrows them) and their totals, or null while no store has a baseline. */
export function goalView(data: ReviewsData | null): {
  rows: GoalRow[];
  summary: GoalSummary;
  context: GoalContextOf;
} | null {
  if (!data?.goals) return null;
  const rows = data.query.store
    ? data.goals.rows.filter((r) => r.storeCode === data.query.store)
    : data.goals.rows;
  const summary = goalSummary(rows);
  return summary.counting > 0
    ? { rows, summary, context: data.goals.context }
    : null;
}

export const toneOf = (row: GoalRow, context: GoalContextOf): GoalTone =>
  GOAL_TONE[goalStatus(row, context)];

/** Search text and tone chip applied to the goal table and leaderboard (never to the rank itself). */
export function matchesGoalFilter(
  row: GoalRow,
  context: GoalContextOf,
  filter: ReviewsData["goalFilter"],
): boolean {
  if (!filter) return true;
  if (filter.status && toneOf(row, context) !== filter.status) return false;
  const q = filter.q.trim().toLowerCase();
  return (
    q === "" || `${row.displayName} ${row.storeCode}`.toLowerCase().includes(q)
  );
}

const TONE_STYLE: Record<
  GoalTone,
  { bar: string; track: string; chip: string; swatch: string; edge: string }
> = {
  met: {
    bar: "bg-tone-met",
    track: "bg-tone-met-soft",
    chip: "bg-tone-met-soft text-tone-met-ink ring-tone-met/40",
    swatch: "bg-tone-met",
    edge: "border-l-tone-met",
  },
  pace: {
    bar: "bg-tone-pace",
    track: "bg-tone-pace-soft",
    chip: "bg-tone-pace-soft text-tone-pace-ink ring-tone-pace/60",
    swatch: "bg-tone-pace",
    edge: "border-l-tone-pace",
  },
  behind: {
    bar: "bg-tone-behind",
    track: "bg-tone-behind-soft",
    chip: "bg-tone-behind-soft text-tone-behind-ink ring-tone-behind/50",
    swatch: "bg-tone-behind",
    edge: "border-l-tone-behind",
  },
  idle: {
    bar: "bg-tone-idle",
    track: "bg-tone-idle-soft",
    chip: "bg-tone-idle-soft text-tone-idle-ink ring-border-strong/40",
    swatch: "bg-tone-idle",
    edge: "border-l-border-strong",
  },
};

export { TONE_STYLE };

const STATUS_ICON: Record<GoalStatus, typeof Check> = {
  met: Check,
  on_pace: TrendingUp,
  behind_pace: TrendingDown,
  partial_month: Minus,
  not_counting: Minus,
  missed: TrendingDown,
  before_counting: Minus,
};

export function StatusChip({ status }: { status: GoalStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      data-tone={GOAL_TONE[status]}
      className={cn(
        "inline-flex items-center gap-1 rounded-[22px] px-2.5 py-[3px] text-[10.5px] font-bold whitespace-nowrap ring-1 ring-inset",
        TONE_STYLE[GOAL_TONE[status]].chip,
      )}
    >
      <Icon aria-hidden className="size-3" strokeWidth={3} />
      {GOAL_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * The progress bar. Its colour is the goal status: green met, amber on pace, red behind pace, and gray where no verdict
 * can be reached (a part-way baseline, or a store not counting yet — which is "no data", never zero performance).
 */
export function Meter({
  row,
  context,
}: {
  row: GoalRow;
  context: GoalContextOf;
}) {
  const status = goalStatus(row, context);
  const tone = GOAL_TONE[status];
  const style = TONE_STYLE[tone];
  if (status === "not_counting" || status === "before_counting") {
    return (
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn("h-2.5 min-w-[6rem] flex-1 rounded-full", style.track)}
        />
        <span className="w-14 text-right text-[11px] text-muted-foreground">
          {status === "not_counting" ? "Not tracking" : "Not counted"}
        </span>
      </div>
    );
  }
  const p = goalProgress(row.qualifyingMonthToDate, row.monthlyTarget);
  const showPace = status === "on_pace" || status === "behind_pace";
  return (
    <div className="flex items-center gap-2.5">
      <span
        role="progressbar"
        aria-label={`${row.displayName} #${row.storeCode}: ${row.qualifyingMonthToDate} of ${row.monthlyTarget} qualifying reviews, ${GOAL_STATUS_LABEL[status]}`}
        aria-valuemin={0}
        aria-valuemax={row.monthlyTarget}
        aria-valuenow={Math.min(row.qualifyingMonthToDate, row.monthlyTarget)}
        data-tone={tone}
        className={cn(
          "relative h-2.5 min-w-[6rem] flex-1 rounded-full",
          style.track,
        )}
      >
        <span
          data-testid="meter-fill"
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500",
            style.bar,
          )}
          style={{ width: `${p.barPercent}%` }}
        />
        {showPace ? (
          <span
            aria-hidden
            title="Pace mark: where this store should be by now"
            className="absolute -top-[3px] -bottom-[3px] w-0 border-l-2 border-dashed border-measure-benchmark/70"
            style={{ left: `${paceMarkPercent(row.monthlyTarget, context)}%` }}
          />
        ) : null}
      </span>
      <span className="w-14 text-right text-[11.5px] leading-tight font-bold tabular-nums">
        {p.percent}%
        <span className="block text-[10px] font-normal text-muted-foreground">
          {p.over > 0
            ? `+${p.over} over`
            : p.remaining > 0
              ? `${p.remaining} to go`
              : "Goal met"}
        </span>
      </span>
    </div>
  );
}

export function GoalTable({
  rows,
  context,
}: {
  rows: GoalRow[];
  context: GoalContextOf;
}) {
  return (
    <div className="scroll-slim w-full min-w-0 overflow-x-auto">
      <table
        aria-label="Store goal progress"
        className="w-full min-w-[46rem] border-collapse text-left text-[12px]"
      >
        <thead>
          <tr className="border-b border-border bg-surface-muted">
            <th scope="col" className={TH}>
              Store
            </th>
            <th scope="col" className={cn(TH, "text-right")}>
              Store code
            </th>
            <th scope="col" className={cn(TH, "text-right")}>
              Qualifying · this week
            </th>
            <th scope="col" className={cn(TH, "text-right")}>
              Qualifying · month to date
            </th>
            <th scope="col" className={cn(TH, "text-right")}>
              Monthly target
            </th>
            <th scope="col" className={TH}>
              Progress toward target
            </th>
            <th scope="col" className={TH}>
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const counting = isCounting(r);
            const status = goalStatus(r, context);
            return (
              <tr
                key={r.storeCode}
                className="border-b border-border-hairline transition-colors even:bg-surface-muted/40 hover:bg-brand-accent-soft"
              >
                <td
                  className={cn(
                    "border-l-4 px-4 py-3 font-bold",
                    TONE_STYLE[GOAL_TONE[status]].edge,
                  )}
                >
                  {r.displayName}
                  {counting ? (
                    <span className="block text-[10.5px] font-normal text-muted-foreground">
                      Counting since {formatDay(baselineDay(r))}
                      {isPartialMonth(r, context) ? " · partial month" : ""}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.storeCode}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {counting ? r.qualifyingThisWeek : "—"}
                </td>
                <td className="px-4 py-3 text-right text-[14px] font-black tabular-nums">
                  {counting ? r.qualifyingMonthToDate : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.monthlyTarget}
                </td>
                <td className="min-w-[11rem] px-4 py-3">
                  <Meter row={r} context={context} />
                </td>
                <td className="px-4 py-3">
                  <StatusChip status={status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] font-bold text-muted-foreground">
          No stores match this search
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ leaderboard -- */

export interface BoardLinkState {
  rank?: "month" | "week";
  status?: GoalTone | null;
  q?: string;
  month?: string;
}

/** A leaderboard URL that keeps the Location, rank, status and search the page is showing unless overridden. */
export function boardHref(
  data: ReviewsData,
  over: BoardLinkState = {},
): string {
  const rank =
    data.goals?.context.closed && !over.month
      ? "month"
      : (over.rank ?? data.rank);
  const status =
    over.status === undefined ? (data.goalFilter?.status ?? null) : over.status;
  const q = over.q ?? data.goalFilter?.q ?? "";
  const month = over.month ?? data.month;
  const p = new URLSearchParams();
  if (data.query.store) p.set("store", data.query.store);
  if (month && month !== monthOptions()[0]) p.set("month", month);
  if (rank === "week") p.set("rank", "week");
  if (status) p.set("status", status);
  if (q) p.set("q", q);
  const qs = p.toString();
  const base = reviewsTabHref("leaderboard");
  return qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base;
}

export function rankHref(data: ReviewsData, metric: "month" | "week"): string {
  return boardHref(data, { rank: metric });
}

export function RankSegments({ data }: { data: ReviewsData }) {
  const options = [
    { key: "month" as const, label: "Rank by month to date" },
    { key: "week" as const, label: "Rank by this week" },
  ];
  return (
    <div role="group" aria-label="Rank by" className={SEGMENT_GROUP}>
      {options.map((o) =>
        o.key === "week" && data.goals?.context.closed ? (
          <span
            key={o.key}
            aria-disabled="true"
            title="Weekly figures only exist for the current month"
            className={cn(
              SEGMENT,
              "cursor-not-allowed text-muted-foreground opacity-50",
            )}
          >
            {o.label}
          </span>
        ) : (
          <Link
            key={o.key}
            href={rankHref(data, o.key)}
            scroll={false}
            aria-current={data.rank === o.key ? "true" : undefined}
            className={cn(
              SEGMENT,
              data.rank === o.key ? SEGMENT_ON : SEGMENT_OFF,
            )}
          >
            {o.label}
          </Link>
        ),
      )}
    </div>
  );
}

const STATUS_CHIPS: { key: GoalTone | null; label: string }[] = [
  { key: null, label: "All" },
  { key: "met", label: "Goal met" },
  { key: "pace", label: "On pace" },
  { key: "behind", label: "Behind pace" },
  { key: "idle", label: "No verdict" },
];

/** Status filter chips with live counts — links, so each filter is a real URL. */
export function StatusChips({
  data,
  rows,
  context,
}: {
  data: ReviewsData;
  rows: GoalRow[];
  context: GoalContextOf;
}) {
  const active = data.goalFilter?.status ?? null;
  const count = (key: GoalTone | null) =>
    key === null
      ? rows.length
      : rows.filter((r) => toneOf(r, context) === key).length;
  return (
    <div
      role="group"
      aria-label="Filter by status"
      className="flex flex-wrap gap-1.5"
    >
      {STATUS_CHIPS.map((chip) => (
        <Link
          key={chip.label}
          href={boardHref(data, { status: chip.key })}
          scroll={false}
          aria-current={active === chip.key ? "true" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[22px] border px-3 py-[5px] text-[11.5px] transition-colors",
            active === chip.key
              ? "border-selected bg-selected font-bold text-selected-foreground"
              : "border-border-strong bg-surface text-foreground hover:bg-brand-accent-soft",
          )}
        >
          {chip.key ? (
            <span
              aria-hidden
              className={cn("size-2 rounded-full", TONE_STYLE[chip.key].swatch)}
            />
          ) : null}
          {chip.label}
          <span className="font-black tabular-nums">{count(chip.key)}</span>
        </Link>
      ))}
    </div>
  );
}

/** Column grid shared by the leaderboard's heading and rows. */
export const BOARD_GRID =
  "lg:grid-cols-[3.5rem_minmax(0,1.5fr)_5rem_6.5rem_5rem_minmax(0,2fr)_8.5rem]";

export function Leaderboard({
  rows,
  context,
  metric,
  filter,
}: {
  rows: GoalRow[];
  context: GoalContextOf;
  metric: "month" | "week";
  filter?: ReviewsData["goalFilter"];
}) {
  // Rank over every store in view, THEN filter, so searching never changes anyone's rank.
  const closed = context.closed === true;
  const ranked = rankRows(rows, closed ? "month" : metric).filter(({ row }) =>
    matchesGoalFilter(row, context, filter),
  );
  if (ranked.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-[13px] font-bold text-muted-foreground">
        No stores match these filters
      </p>
    );
  }
  return (
    <ol className="divide-y divide-border-hairline">
      {ranked.map(({ row, rank, tied }) => {
        const counting = isCounting(row);
        const status = goalStatus(row, context);
        const style = TONE_STYLE[GOAL_TONE[status]];
        // A store that was not counting yet in a closed month has no standing to rank or tie.
        const unranked = status === "before_counting";
        return (
          <li
            key={row.storeCode}
            className={cn(
              "grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-l-4 px-4 py-3.5 text-[12px] transition-colors even:bg-surface-muted/40 hover:bg-brand-accent-soft lg:gap-y-0",
              BOARD_GRID,
              style.edge,
            )}
          >
            <span className="flex flex-col items-center">
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-full text-[15px] font-black tabular-nums",
                  rank !== null && !unranked && rank <= 3
                    ? "bg-brand-accent text-brand-accent-foreground"
                    : "bg-surface-muted text-body-foreground",
                )}
              >
                {rank === null || unranked ? "—" : rank}
              </span>
              {tied && !unranked ? (
                <span className="mt-0.5 text-[8px] font-black tracking-[0.1em] text-muted-foreground uppercase">
                  Tied
                </span>
              ) : null}
            </span>
            <span className="font-bold">
              {row.displayName}{" "}
              <span className="font-normal text-muted-foreground">
                #{row.storeCode}
              </span>
            </span>
            <span className="col-span-2 flex gap-4 text-[11.5px] text-muted-foreground lg:hidden">
              <span>
                This week{" "}
                <b className="text-foreground">
                  {counting && !closed ? `+${row.qualifyingThisWeek}` : "—"}
                </b>
              </span>
              <span>
                Month{" "}
                <b className="text-foreground">
                  {counting
                    ? `${row.qualifyingMonthToDate} / ${row.monthlyTarget}`
                    : "—"}
                </b>
              </span>
            </span>
            <span className="hidden text-right tabular-nums lg:block">
              {counting && !closed ? `+${row.qualifyingThisWeek}` : "—"}
            </span>
            <span className="hidden text-right lg:block">
              <span className="display-figure text-[18px] tabular-nums">
                {counting ? row.qualifyingMonthToDate : "—"}
              </span>
            </span>
            <span className="hidden text-right text-muted-foreground tabular-nums lg:block">
              {row.monthlyTarget}
            </span>
            <span className="col-span-2 lg:col-span-1">
              <Meter row={row} context={context} />
            </span>
            <span className="col-span-2 lg:col-span-1">
              <StatusChip status={status} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ----------------------------------------------------------------- labels -- */

const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
export function formatDay(day: string | null): string {
  return day ? DAY_LABEL.format(new Date(`${day}T00:00:00Z`)) : "—";
}

/** The honest caveat for a month whose baselines were set part-way through; null when every store has a full month. */
export function partialMonthText(
  g: ReturnType<typeof goalView>,
): string | null {
  if (!g) return null;
  const note = partialMonthNote(g.rows, g.context);
  if (!note) return null;
  const span =
    note.from === note.to
      ? formatDay(note.from)
      : `${formatDay(note.from)}–${formatDay(note.to)}`;
  return `Partial month: counting for ${note.salons} store${note.salons === 1 ? "" : "s"} began ${span}, so this month's totals cover only part of it. Stores short of target show "Partial month" rather than a pace verdict, and "reviews still needed" is measured against the full monthly target.`;
}

/** "Oct 12 – Oct 18" for two `yyyy-mm-dd` Central dates. */
export function rangeLabel(from: string, to: string): string {
  return `${formatDay(from)} – ${formatDay(to)}`;
}
