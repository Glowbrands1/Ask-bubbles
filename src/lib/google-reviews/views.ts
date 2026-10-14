import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { APPROVED_GOOGLE_STORES } from "@/config/company/google-reviews";
import { getSupabaseAdmin } from "@/lib/supabase/server";

import { classifyDatabaseError } from "./database-error";
import { centralMidnight, centralToday, goalContext, type GoalContext, type GoalRow } from "./goals";
import type { GoogleFailureCode } from "./types";

/**
 * READ MODELS FOR THE GOOGLE REVIEWS SCREEN AND ITS API.
 *
 * Everything here is read with the server-side key and returned only to routes
 * and pages that have already required the Manage integrations permission:
 * review TEXT appears in `ReviewRow`, which is why.
 *
 * Only the reviewer's display name is held (no photo, URL or id).
 */

export const PAGE_SIZE = 20;
export const CENTRAL = "America/Chicago";

export interface StoreSummary {
  storeCode: string;
  displayName: string;
  address: string;
  matchStatus: "unmatched" | "matched" | "candidate" | "mismatch" | "ambiguous" | "confirmed";
  matchConfidence: "none" | "low" | "medium" | "high";
  reviewCount: number;
  averageRating: number | null;
  unansweredCount: number;
  ratings: [number, number, number, number, number];
  latestReviewAt: string | null;
  oldestReviewAt: string | null;
  /** Google's own reported total for the profile, as of the last read. */
  apiTotalReviewCount: number | null;
  apiTotalCheckedAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: "complete" | "incomplete" | "failed" | null;
  lastSyncError: string | null;
  /** For a candidate: what an administrator needs to decide. Business title and street only. */
  candidate: { account: string; location: string; title: string | null; street: string | null; city: string | null; state: string | null } | null;
  /** Why a store did not link, as a short code (never text from Google). */
  reason: string | null;
}

export interface ReviewRow {
  id: string;
  storeCode: string;
  storeName: string;
  starRating: number;
  comment: string | null;
  reviewerName: string | null;
  createdAt: string;
  updatedAt: string;
  replyComment: string | null;
  replyUpdatedAt: string | null;
  hasReply: boolean;
  removedAt: string | null;
}

export interface RunRow {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "succeeded" | "partial" | "failed" | "refused";
  mode: "dry_run" | "save";
  requestedBy: string;
  locationsAttempted: number;
  locationsComplete: number;
  reviewsFetched: number;
  reviewsInserted: number;
  reviewsUpdated: number;
  reviewsMarkedRemoved: number;
  errorCode: string | null;
}

export type ConnectionState =
  | { state: "none" }
  | { state: "active"; connectedAt: string; connectedBy: string; lastUsedAt: string | null }
  | { state: "expired" | "revoked" | "error"; endedAt: string | null; errorCode: string | null };

export interface ReviewQuery {
  store: string | null;
  rating: number | null;
  reply: "answered" | "unanswered" | null;
  /** Inclusive start day, YYYY-MM-DD, Central time. */
  from: string | null;
  /** Inclusive end day, YYYY-MM-DD, Central time. */
  to: string | null;
  removed: boolean;
  page: number;
}

export interface ReviewPage {
  rows: ReviewRow[];
  total: number;
  page: number;
  pageSize: number;
}

export const EMPTY_QUERY: ReviewQuery = { store: null, rating: null, reply: null, from: null, to: null, removed: false, page: 1 };

/* ------------------------------------------------------------ query parsing -- */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function validDay(value: string | null): string | null {
  if (!value || !DAY.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value ? null : value;
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams;
const read = (params: Params, key: string): string | null => {
  if (params instanceof URLSearchParams) return params.get(key);
  const v = params[key];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
};

/** Never trusts a query string: anything that is not a known value becomes "no filter". */
export function parseReviewQuery(params: Params): ReviewQuery {
  const store = read(params, "store");
  const rating = Number(read(params, "rating"));
  const reply = read(params, "reply");
  const page = Number(read(params, "page"));
  return {
    store: store && APPROVED_GOOGLE_STORES.some((s) => s.code === store) ? store : null,
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    reply: reply === "answered" || reply === "unanswered" ? reply : null,
    from: validDay(read(params, "from")),
    to: validDay(read(params, "to")),
    removed: read(params, "removed") === "1",
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}

/** The instant a calendar day starts in Central time (handles daylight saving), as an ISO string. */
export function centralDayStart(day: string): string {
  return centralMidnight(day);
}

/** The first instant AFTER the end day (exclusive bound), in Central time. */
export function centralDayAfter(day: string): string {
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 24 * 3600 * 1000).toISOString().slice(0, 10);
  return centralDayStart(next);
}

/* --------------------------------------------------------------- the reads -- */

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export class GoogleViewError extends Error {
  readonly reason: "missing" | "unavailable";
  constructor(reason: GoogleViewError["reason"]) {
    super(reason === "missing" ? "The Google Reviews tables have not been created in this database." : "The Google Reviews data could not be read.");
    this.name = "GoogleViewError";
    this.reason = reason;
  }
}

function check(error: { message?: string; code?: string } | null): void {
  if (error) throw new GoogleViewError(classifyDatabaseError(error) === "missing" ? "missing" : "unavailable");
}

export async function readStoreSummaries(client: SupabaseClient = getSupabaseAdmin()): Promise<StoreSummary[]> {
  const [stats, evidence] = await Promise.all([
    client.from("google_review_location_stats").select("*").order("store_code", { ascending: true }),
    client.from("google_review_locations").select("store_code,match_evidence"),
  ]);
  check(stats.error);
  check(evidence.error);
  const evidenceByCode = new Map(((evidence.data ?? []) as Record<string, unknown>[]).map((r) => [String(r.store_code), (r.match_evidence ?? {}) as Record<string, unknown>]));

  return ((stats.data ?? []) as Record<string, unknown>[])
    .map((row): StoreSummary => {
      const code = String(row.store_code);
      const ev = evidenceByCode.get(code) ?? {};
      const cand = ev.candidate && typeof ev.candidate === "object" ? (ev.candidate as Record<string, unknown>) : null;
      const status = row.match_status as StoreSummary["matchStatus"];
      return {
        storeCode: code,
        displayName: String(row.display_name),
        address: [row.address_line1, row.address_line2, `${row.city}, ${row.state} ${row.postal_code}`].filter(Boolean).join(", "),
        matchStatus: status,
        matchConfidence: row.match_confidence as StoreSummary["matchConfidence"],
        reviewCount: num(row.review_count),
        averageRating: row.average_rating === null || row.average_rating === undefined ? null : num(row.average_rating),
        unansweredCount: num(row.unanswered_count),
        ratings: [num(row.rating_1), num(row.rating_2), num(row.rating_3), num(row.rating_4), num(row.rating_5)],
        latestReviewAt: str(row.latest_review_at),
        oldestReviewAt: str(row.oldest_review_at),
        apiTotalReviewCount: row.api_total_review_count === null || row.api_total_review_count === undefined ? null : num(row.api_total_review_count),
        apiTotalCheckedAt: str(row.api_total_checked_at),
        lastSyncAt: str(row.last_sync_at),
        lastSyncStatus: (str(row.last_sync_status) as StoreSummary["lastSyncStatus"]) ?? null,
        lastSyncError: str(row.last_sync_error),
        candidate:
          status === "candidate" && cand && typeof cand.account === "string" && typeof cand.location === "string"
            ? { account: cand.account, location: cand.location, title: str(cand.title), street: str(cand.street), city: str(cand.city), state: str(cand.state) }
            : null,
        reason: str(ev.reason),
      };
    })
    // the allowlist's own order, so the screen reads the same every time
    .sort((a, b) => APPROVED_GOOGLE_STORES.findIndex((s) => s.code === a.storeCode) - APPROVED_GOOGLE_STORES.findIndex((s) => s.code === b.storeCode));
}

export async function readReviewPage(query: ReviewQuery, client: SupabaseClient = getSupabaseAdmin()): Promise<ReviewPage> {
  const { data, error } = await client.rpc("google_reviews_search", {
    p_store_code: query.store,
    p_rating: query.rating,
    p_reply: query.reply,
    p_from: query.from ? centralDayStart(query.from) : null,
    p_to: query.to ? centralDayAfter(query.to) : null,
    p_removed: query.removed,
    p_limit: PAGE_SIZE,
    p_offset: (query.page - 1) * PAGE_SIZE,
  });
  check(error);
  const result = (data ?? { total: 0, rows: [] }) as { total?: number; rows?: Record<string, unknown>[] };
  return {
    total: num(result.total),
    page: query.page,
    pageSize: PAGE_SIZE,
    rows: (result.rows ?? []).map((r) => ({
      id: String(r.id),
      storeCode: String(r.store_code),
      storeName: String(r.store_name),
      starRating: num(r.star_rating),
      comment: str(r.comment),
      reviewerName: str(r.reviewer_name),
      createdAt: String(r.review_create_time),
      updatedAt: String(r.review_update_time),
      replyComment: str(r.reply_comment),
      replyUpdatedAt: str(r.reply_update_time),
      hasReply: r.has_reply === true,
      removedAt: str(r.removed_at),
    })),
  };
}

export type PeriodUnit = "week" | "month";

export interface PeriodPoint {
  /** First day of the period, YYYY-MM-DD, Central: the Monday of a week, or the 1st of a month. */
  start: string;
  reviewCount: number;
  /** 3–5★ reviews in the period. */
  qualifyingCount: number;
  averageRating: number;
}

/** Reviews per Monday–Sunday week or calendar month by ORIGINAL review date (Central), for one store or all. */
export async function readPeriodTrend(unit: PeriodUnit, storeCode: string | null = null, client: SupabaseClient = getSupabaseAdmin()): Promise<PeriodPoint[]> {
  const { data, error } = await client.rpc("google_reviews_periods", { p_store_code: storeCode, p_unit: unit });
  check(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    start: String(r.period_start),
    reviewCount: num(r.review_count),
    qualifyingCount: num(r.qualifying_count),
    averageRating: num(r.average_rating),
  }));
}

export async function readRecentRuns(limit = 10, client: SupabaseClient = getSupabaseAdmin()): Promise<RunRow[]> {
  const { data, error } = await client
    .from("google_review_sync_runs")
    .select("id,started_at,finished_at,status,mode,requested_by,locations_attempted,locations_complete,reviews_fetched,reviews_inserted,reviews_updated,reviews_marked_removed,error_code")
    .order("started_at", { ascending: false })
    .limit(limit);
  check(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    startedAt: String(r.started_at),
    finishedAt: str(r.finished_at),
    status: r.status as RunRow["status"],
    mode: r.mode as RunRow["mode"],
    requestedBy: String(r.requested_by),
    locationsAttempted: num(r.locations_attempted),
    locationsComplete: num(r.locations_complete),
    reviewsFetched: num(r.reviews_fetched),
    reviewsInserted: num(r.reviews_inserted),
    reviewsUpdated: num(r.reviews_updated),
    reviewsMarkedRemoved: num(r.reviews_marked_removed),
    errorCode: str(r.error_code),
  }));
}

export async function readConnectionState(client: SupabaseClient = getSupabaseAdmin()): Promise<ConnectionState> {
  const { data, error } = await client
    .from("google_business_connections")
    .select("status,connected_at,connected_by,last_used_at,revoked_at,last_error_code")
    .order("created_at", { ascending: false })
    .limit(1);
  check(error);
  const row = ((data ?? []) as Record<string, unknown>[])[0];
  if (!row) return { state: "none" };
  if (row.status === "active") return { state: "active", connectedAt: String(row.connected_at), connectedBy: String(row.connected_by), lastUsedAt: str(row.last_used_at) };
  return { state: row.status as "expired" | "revoked" | "error", endedAt: str(row.revoked_at), errorCode: str(row.last_error_code) };
}

/** Whole-integration totals across the stores that have reviews. */
export function summarize(stores: readonly StoreSummary[]): { reviews: number; average: number | null; unanswered: number; storesLinked: number; storesTotal: number } {
  const reviews = stores.reduce((a, s) => a + s.reviewCount, 0);
  const weighted = stores.reduce((a, s) => a + (s.averageRating ?? 0) * s.reviewCount, 0);
  return {
    reviews,
    average: reviews > 0 ? Math.round((weighted / reviews) * 100) / 100 : null,
    unanswered: stores.reduce((a, s) => a + s.unansweredCount, 0),
    storesLinked: stores.filter((s) => s.matchStatus === "matched" || s.matchStatus === "confirmed").length,
    storesTotal: stores.length,
  };
}

/**
 * The ONE thing standing between this integration and live reviews, in words a
 * person can act on — or null when nothing stands in the way. Derived from
 * measured facts (configuration, the connection, the last run's code); never
 * from a guess.
 */
export type Blocker =
  | { code: "not_configured"; missing: string[] }
  | { code: "disabled" }
  | { code: "not_connected" }
  | { code: "authorization_expired" }
  | { code: "api_access_pending" }
  | { code: "api_disabled" }
  | { code: "last_run_failed"; errorCode: string }
  | null;

export function deriveBlocker(input: {
  enabled: boolean;
  credentialsReady: boolean;
  missingCredentials: string[];
  connection: ConnectionState;
  lastRun: RunRow | null;
}): Blocker {
  if (!input.credentialsReady) return { code: "not_configured", missing: input.missingCredentials };
  if (!input.enabled) return { code: "disabled" };
  if (input.connection.state === "none") return { code: "not_connected" };
  if (input.connection.state !== "active") return { code: "authorization_expired" };
  const code = input.lastRun?.status === "failed" ? (input.lastRun.errorCode as GoogleFailureCode | null) : null;
  if (code === "api_access_pending") return { code: "api_access_pending" };
  if (code === "api_disabled") return { code: "api_disabled" };
  if (code === "authorization_expired") return { code: "authorization_expired" };
  if (code && code !== "busy") return { code: "last_run_failed", errorCode: code };
  return null;
}

/* ------------------------------------------------------------- goal counts -- */

export interface GoalData {
  context: GoalContext;
  rows: GoalRow[];
}

/** Per-salon goal counts for the current Central week and month. Null-safe: nothing here reads Google. */
export async function readGoalData(now: Date = new Date(), client: SupabaseClient = getSupabaseAdmin()): Promise<GoalData> {
  const context = goalContext(centralToday(now));
  const { data, error } = await client.rpc("google_review_goal_counts_v2", {
    p_prev_week_start: centralDayStart(context.prevWeekStart),
    p_week_start: centralDayStart(context.weekStart),
    p_month_start: centralDayStart(context.monthStart),
    p_now: now.toISOString(),
  });
  check(error);
  const rows = ((data ?? []) as Record<string, unknown>[]).map(
    (r): GoalRow => ({
      storeCode: String(r.store_code),
      displayName: String(r.display_name),
      monthlyTarget: num(r.monthly_target),
      baselineReviewId: str(r.baseline_review_id),
      baselineReviewTime: str(r.baseline_review_time),
      countFrom: str(r.count_from),
      qualifyingThisWeek: num(r.week_count),
      qualifyingLastWeek: num(r.last_week_count),
      qualifyingMonthToDate: num(r.month_count),
      historical: num(r.historical_count),
    }),
  );
  rows.sort((a, b) => APPROVED_GOOGLE_STORES.findIndex((s) => s.code === a.storeCode) - APPROVED_GOOGLE_STORES.findIndex((s) => s.code === b.storeCode));
  return { context, rows };
}
