import "server-only";

import { APPROVED_GOOGLE_STORES } from "@/config/company/google-reviews";

import {
  centralToday,
  closedMonthContext,
  goalContext,
  monthOf,
  type GoalRow,
} from "./goals";
import type { GoogleReviewsStatus } from "./status";
import {
  PAGE_SIZE,
  centralDayAfter,
  centralDayStart,
  type ConnectionState,
  type GoalData,
  type PeriodPoint,
  type PeriodUnit,
  type ReviewPage,
  type ReviewQuery,
  type RunRow,
  type StoreSummary,
} from "./views";

/**
 * ============================================================================
 * THE GOOGLE REVIEWS READ MODELS, COMPUTED FROM A LABELLED SAMPLE
 * ============================================================================
 *
 * DEMO BUILDS ONLY. A demo deployment has no database, so `/reviews` and the
 * Google Reviews admin screen used to say "not connected". The demo runtime now
 * hands over an invented review set (`data/demo/google-reviews.ts`), and this
 * module turns it into exactly the shapes `views.ts` reads from Supabase —
 * `StoreSummary`, `ReviewPage`, `PeriodPoint`, `GoalData` — following the SQL
 * functions' rules (live reviews only; 3–5★ after the counting start qualify;
 * Central-time days, Monday weeks, calendar months; newest first).
 *
 * The real screens then render unchanged. This file holds no data of its own:
 * every row comes from the sample it is given.
 */

export interface GoogleReviewsSampleReview {
  readonly id: string;
  readonly storeCode: string;
  readonly starRating: number;
  readonly comment: string | null;
  readonly reviewerName: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly replyComment: string | null;
  readonly replyUpdatedAt: string | null;
  readonly removedAt: string | null;
}

export interface GoogleReviewsSampleGoal {
  readonly storeCode: string;
  readonly monthlyTarget: number;
  /** Reviews created at or after this instant count toward the goal. */
  readonly countFrom: string | null;
}

export interface GoogleReviewsSample {
  readonly reviews: readonly GoogleReviewsSampleReview[];
  readonly goals: readonly GoogleReviewsSampleGoal[];
  readonly connection: ConnectionState;
  /** Newest first. */
  readonly runs: readonly RunRow[];
  /** Store codes an administrator confirmed by hand (the rest matched on code and address). */
  readonly confirmedStores: readonly string[];
}

const live = (r: GoogleReviewsSampleReview) => r.removedAt === null;
const storeName = (code: string) =>
  APPROVED_GOOGLE_STORES.find((s) => s.code === code)?.displayName ?? code;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** What `readStoreSummaries` returns, in the allowlist's order. */
export function sampleStoreSummaries(sample: GoogleReviewsSample): StoreSummary[] {
  const lastRun = sample.runs.find((r) => r.status !== "running") ?? null;
  return APPROVED_GOOGLE_STORES.map((store): StoreSummary => {
    const rows = sample.reviews.filter((r) => r.storeCode === store.code && live(r));
    const ratings: StoreSummary["ratings"] = [0, 0, 0, 0, 0];
    for (const r of rows) ratings[r.starRating - 1]! += 1;
    const times = rows.map((r) => r.createdAt).sort();
    return {
      storeCode: store.code,
      displayName: store.displayName,
      address: [store.addressLine1, store.addressLine2, `${store.city}, ${store.state} ${store.postalCode}`]
        .filter(Boolean)
        .join(", "),
      matchStatus: sample.confirmedStores.includes(store.code) ? "confirmed" : "matched",
      matchConfidence: "high",
      reviewCount: rows.length,
      averageRating: rows.length ? round2(rows.reduce((a, r) => a + r.starRating, 0) / rows.length) : null,
      unansweredCount: rows.filter((r) => r.replyComment === null).length,
      ratings,
      latestReviewAt: times[times.length - 1] ?? null,
      oldestReviewAt: times[0] ?? null,
      apiTotalReviewCount: rows.length,
      apiTotalCheckedAt: lastRun?.finishedAt ?? null,
      lastSyncAt: lastRun?.finishedAt ?? null,
      lastSyncStatus: lastRun ? "complete" : null,
      lastSyncError: null,
      candidate: null,
      reason: null,
    };
  });
}

/** What `readReviewPage` returns: the `google_reviews_search` filters, newest first. */
export function sampleReviewPage(sample: GoogleReviewsSample, query: ReviewQuery): ReviewPage {
  const from = query.from ? centralDayStart(query.from) : null;
  const to = query.to ? centralDayAfter(query.to) : null;
  const t = (iso: string) => Date.parse(iso);
  const matching = sample.reviews
    .filter(
      (r) =>
        (query.store === null || r.storeCode === query.store) &&
        (query.rating === null || r.starRating === query.rating) &&
        (query.reply === null || (query.reply === "answered") === (r.replyComment !== null)) &&
        (from === null || t(r.createdAt) >= t(from)) &&
        (to === null || t(r.createdAt) < t(to)) &&
        query.removed === (r.removedAt !== null),
    )
    .sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : b.createdAt.localeCompare(a.createdAt)));
  const offset = (query.page - 1) * PAGE_SIZE;
  return {
    total: matching.length,
    page: query.page,
    pageSize: PAGE_SIZE,
    rows: matching.slice(offset, offset + PAGE_SIZE).map((r) => ({
      id: r.id,
      storeCode: r.storeCode,
      storeName: storeName(r.storeCode),
      starRating: r.starRating,
      comment: r.comment,
      reviewerName: r.reviewerName,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      replyComment: r.replyComment,
      replyUpdatedAt: r.replyUpdatedAt,
      hasReply: r.replyComment !== null,
      removedAt: r.removedAt,
    })),
  };
}

/** The Monday opening a Central day's week, or the 1st of its month. */
function periodStartOf(day: string, unit: PeriodUnit): string {
  if (unit === "month") return `${day.slice(0, 7)}-01`;
  return goalContext(day).weekStart;
}

/** What `readPeriodTrend` returns: `google_reviews_periods`, live reviews only, oldest first. */
export function samplePeriodTrend(
  sample: GoogleReviewsSample,
  unit: PeriodUnit,
  storeCode: string | null = null,
): PeriodPoint[] {
  const buckets = new Map<string, { n: number; q: number; sum: number }>();
  for (const r of sample.reviews) {
    if (!live(r) || (storeCode !== null && r.storeCode !== storeCode)) continue;
    const key = periodStartOf(centralToday(new Date(r.createdAt)), unit);
    const b = buckets.get(key) ?? { n: 0, q: 0, sum: 0 };
    b.n += 1;
    b.sum += r.starRating;
    if (r.starRating >= 3) b.q += 1;
    buckets.set(key, b);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, b]) => ({ start, reviewCount: b.n, qualifyingCount: b.q, averageRating: round2(b.sum / b.n) }));
}

/** `google_review_goal_counts_v2`, applied to the sample. */
function goalRows(
  sample: GoogleReviewsSample,
  bounds: { prevWeekStart: string; weekStart: string; monthStart: string; now: string },
): GoalRow[] {
  const t = Date.parse;
  return APPROVED_GOOGLE_STORES.flatMap((store): GoalRow[] => {
    const goal = sample.goals.find((g) => g.storeCode === store.code);
    if (!goal) return [];
    const rows = sample.reviews.filter((r) => r.storeCode === store.code && live(r));
    const after = (r: GoogleReviewsSampleReview) => goal.countFrom !== null && t(r.createdAt) >= t(goal.countFrom);
    const counted = rows.filter((r) => after(r) && r.starRating >= 3);
    const within = (from: string, to: string, inclusive: boolean) =>
      counted.filter((r) => t(r.createdAt) >= t(from) && (inclusive ? t(r.createdAt) <= t(to) : t(r.createdAt) < t(to))).length;
    return [
      {
        storeCode: store.code,
        displayName: store.displayName,
        monthlyTarget: goal.monthlyTarget,
        baselineReviewId: null,
        baselineReviewTime: null,
        countFrom: goal.countFrom,
        qualifyingThisWeek: within(bounds.weekStart, bounds.now, true),
        qualifyingLastWeek: within(bounds.prevWeekStart, bounds.weekStart, false),
        qualifyingMonthToDate: within(bounds.monthStart, bounds.now, true),
        historical: rows.filter((r) => !after(r)).length,
      },
    ];
  });
}

/** What `readGoalData` returns, for the current Central week and month. */
export function sampleGoalData(sample: GoogleReviewsSample, now: Date = new Date()): GoalData {
  const context = goalContext(centralToday(now));
  return {
    context,
    rows: goalRows(sample, {
      prevWeekStart: centralDayStart(context.prevWeekStart),
      weekStart: centralDayStart(context.weekStart),
      monthStart: centralDayStart(context.monthStart),
      now: now.toISOString(),
    }),
  };
}

/** What `readGoalDataForMonth` returns: a closed month reads with the same bounds the SQL call uses. */
export function sampleGoalDataForMonth(sample: GoogleReviewsSample, month: string, now: Date = new Date()): GoalData {
  if (month >= monthOf(centralToday(now))) return sampleGoalData(sample, now);
  const context = closedMonthContext(month);
  const monthStart = centralDayStart(context.monthStart);
  return {
    context,
    rows: goalRows(sample, {
      prevWeekStart: monthStart,
      weekStart: monthStart,
      monthStart,
      now: new Date(new Date(context.monthEndInstant!).getTime() - 1).toISOString(),
    }),
  };
}

/**
 * What `readGoogleReviewsStatus` returns for the sample: switched on, scheduled,
 * connected, nothing blocking. No environment variable is read — a demo build
 * has no Google credentials and never contacts Google.
 */
export function sampleStatus(sample: GoogleReviewsSample): GoogleReviewsStatus {
  return {
    enabled: true,
    writesEnabled: true,
    scheduleEnabled: true,
    credentialsReady: true,
    missingCredentials: [],
    redirectUri: null,
    connection: sample.connection,
    runs: [...sample.runs],
    blocker: null,
  };
}
