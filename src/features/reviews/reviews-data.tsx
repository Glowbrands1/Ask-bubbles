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
