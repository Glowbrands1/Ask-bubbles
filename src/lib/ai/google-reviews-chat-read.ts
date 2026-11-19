import "server-only";

import { APPROVED_GOOGLE_STORES } from "@/config/company/google-reviews";
import { supabaseReadiness } from "@/lib/config/server-env";
import { EMPTY_QUERY, readGoalData, readMonthlyProgress, readPeriodTrend, readReviewPage, readStoreSummaries, type StoreSummary } from "@/lib/google-reviews/views";
import type { GoalContext } from "@/lib/google-reviews/goals";
import { codeOfLocationId } from "@/lib/locations";
import { hasPermission, DEFAULT_PERMISSION_MATRIX } from "@/lib/permissions";
import { reportingScopeOf } from "@/lib/reporting/scope/authorized-locations";
import type { AccessScope, Role } from "@/types";

import {
  asksForMonthlyPeriods,
  formatGoogleReviewsBlock,
  formatReviewMonthsSection,
  formatReviewWeeksSection,
  isGoogleReviewQuestion,
  RECENT_REVIEWS_SHOWN,
  type RecentReview,
  type StoreWeekTrend,
  reviewsNotPermittedBlock,
  reviewsUnavailableBlock,
  storeCodesNamedIn,
} from "./google-reviews-chat";

export interface GoogleReviewsChatBlock {
  readonly text: string;
  /** True when the block carries review figures, not only a decline. */
  readonly figures: boolean;
}

/** When reviews were last saved: the newest store sync that completed, in full or in part. */
function lastSavedAt(stores: readonly StoreSummary[] | null): string | null {
  const saved = (stores ?? [])
    .filter((store) => store.lastSyncAt && (store.lastSyncStatus === "complete" || store.lastSyncStatus === "incomplete"))
    .map((store) => store.lastSyncAt!)
    .sort();
  return saved.at(-1) ?? null;
}

/** A read that may fail (or throw before it starts) without failing the block: null instead. */
async function orNull<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

/** Each store's Monday–Sunday weekly trend (the page's own read), or null when any could not be read. */
async function readWeekTrends(storeCodes: readonly string[]): Promise<StoreWeekTrend[] | null> {
  const trends = await Promise.all(
    storeCodes.map((storeCode) => orNull(async (): Promise<StoreWeekTrend> => ({ storeCode, points: await readPeriodTrend("week", storeCode) }))),
  );
  const read = trends.filter((trend): trend is StoreWeekTrend => trend !== null);
  return read.length === trends.length ? read : null;
}

/** The newest reviews of these stores since last week's Monday (the page's Reviews list, newest first). */
async function readRecentReviews(storeCodes: readonly string[], context: GoalContext): Promise<RecentReview[] | null> {
  // One read per store (the page's own query), so a busy store never pushes another store's reviews out of the page
  // (audit, 18 Nov 2026: two named stores read 20 rows across every store, then said "No review was posted").
  const allStores = APPROVED_GOOGLE_STORES.every((store) => storeCodes.includes(store.code));
  const reads: (string | null)[] = allStores ? [null] : storeCodes.length === 1 ? [storeCodes[0]!] : [...storeCodes];
  const pages = await Promise.all(
    reads.map((store) => orNull(() => readReviewPage({ ...EMPTY_QUERY, store, from: context.prevWeekStart, to: context.today }))),
  );
  if (pages.some((page) => page === null)) return null;
  return pages
    .flatMap((page) => page!.rows)
    .filter((row) => storeCodes.includes(row.storeCode) && row.removedAt === null)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, RECENT_REVIEWS_SHOWN)
    .map((row) => ({ storeCode: row.storeCode, createdAt: row.createdAt, starRating: row.starRating, comment: row.comment, hasReply: row.hasReply }));
}

/**
 * L3, L6, YTD and each month (manager request in the sibling app, 19 Nov 2026), from the page's own month-by-month
 * read. Only for a turn that asks for those periods; a failed read says so and never fails the figures above.
 */
async function readMonthsSection(
  question: string,
  rows: Parameters<typeof formatReviewMonthsSection>[0]["rows"],
  own: ReadonlySet<string>,
  now: Date,
): Promise<string | null> {
  if (!asksForMonthlyPeriods(question) || rows.length === 0) return null;
  try {
    return formatReviewMonthsSection({ progress: await readMonthlyProgress(now), rows, ownStoreCodes: own });
  } catch {
    return "GOOGLE REVIEWS — L3, L6, YTD AND MONTH BY MONTH\n\nThe month-by-month figures could not be read just now. Give no L3, L6, YTD or monthly figure; point the manager to Google Reviews in the sidebar, Overview, Month by month.";
  }
}

/**
 * The Google review block for one chat turn, or null when the question is not
 * about Google reviews.
 *
 * View reports (the Google Reviews page's permission) is checked first:
 * without it nothing is read. The rows are the ones /reviews shows this
 * caller (every store; the page does not narrow by assignment), narrowed to
 * any store the question names, with the caller's own stores marked. The
 * figures come from `readGoalData`, the read the page renders, and the last
 * sync from the stores' own sync times. Below them, this week and last week
 * (Monday–Sunday, Central) from the page's weekly trend, each store's average
 * rating, and the newest reviews from the page's Reviews list; a failed weekly
 * read says so in the block and never fails the month-to-date figures.
 */
export async function loadGoogleReviewsChatBlock(input: {
  readonly question: string;
  readonly role: Role | null;
  readonly scope: AccessScope | null;
  readonly now?: Date;
}): Promise<GoogleReviewsChatBlock | null> {
  if (!isGoogleReviewQuestion(input.question)) return null;

  if (input.role === null || !hasPermission(DEFAULT_PERMISSION_MATRIX, input.role, "view_reports")) {
    return { text: reviewsNotPermittedBlock(), figures: false };
  }

  if (!supabaseReadiness().ready) {
    return { text: reviewsUnavailableBlock("This deployment cannot read the Google review records."), figures: false };
  }

  const scope = reportingScopeOf(input.scope);
  const own = new Set(scope.unrestricted ? [] : scope.locationIds.map((id) => codeOfLocationId(id)).filter((code): code is string => code !== null));
  const named = storeCodesNamedIn(input.question);

  try {
    const [goals, stores] = await Promise.all([readGoalData(), readStoreSummaries().catch(() => null)]);
    const rows = goals.rows.filter((row) => named.length === 0 || named.includes(row.storeCode));
    const codes = rows.map((row) => row.storeCode);
    /* This week and last week, and the newest reviews (QA, 18 Nov 2026): the same stores, the page's own reads. */
    const [trends, recent] = await Promise.all([readWeekTrends(codes), readRecentReviews(codes, goals.context)]);
    const month = formatGoogleReviewsBlock({
      context: goals.context,
      rows,
      ownStoreCodes: own,
      lastSyncAt: lastSavedAt(stores),
      now: input.now ?? new Date(),
    });
    const weeks =
      rows.length > 0
        ? formatReviewWeeksSection({
            context: goals.context,
            rows,
            ownStoreCodes: own,
            trends,
            averages: new Map((stores ?? []).map((store) => [store.storeCode, { averageRating: store.averageRating, reviewCount: store.reviewCount }])),
            recent,
          })
        : null;
    const months = await readMonthsSection(input.question, rows, own, input.now ?? new Date());
    return {
      text: [month, weeks, months].filter(Boolean).join("\n\n"),
      figures: rows.length > 0,
    };
  } catch {
    return { text: reviewsUnavailableBlock("The Google review figures could not be read just now."), figures: false };
  }
}
