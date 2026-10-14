import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdmin } from "@/lib/supabase/server";

import type { GoogleFailureCode, MatchConfidence, MatchStatus, NormalizedReview, StoredConnection, StoredLocation } from "./types";

/**
 * THE GOOGLE REVIEWS STORE — every database call the integration makes.
 *
 * Reads and writes go through the server-side secret key only. Every WRITE is a
 * SECURITY DEFINER function (see the migration), each of which re-checks what it
 * depends on inside its own transaction: the run is a running save run, the
 * location holds an accepted link, a review's resource name belongs to that
 * location. A refusal changes nothing.
 *
 * ERRORS NEVER CARRY ROW CONTENT. A Postgres message for these tables can quote
 * a review's text or a token column; it is mapped to a code here and dropped.
 */

export class GoogleStoreError extends Error {
  readonly code: Extract<GoogleFailureCode, "store_error" | "removal_guard" | "busy">;
  constructor(code: GoogleStoreError["code"], what: string) {
    super(`Google Reviews store: could not ${what}.`);
    this.name = "GoogleStoreError";
    this.code = code;
  }
}

type DbError = { message?: string; code?: string } | null;

function fail(error: DbError, what: string): never {
  const message = error?.message ?? "";
  if (/removal_guard/.test(message)) throw new GoogleStoreError("removal_guard", what);
  throw new GoogleStoreError("store_error", what);
}

/** PostgREST returns a function's scalar directly; the test adapter's rows are unwrapped the same way. */
function scalar<T>(data: unknown): T {
  return data as T;
}

export interface ApplyResult {
  inserted: number;
  updated: number;
  unchanged: number;
  removed: number;
  restored: number;
}

export interface RunStats {
  [key: string]: number | string | boolean | null | Record<string, number>;
}

export interface GoogleReviewsStore {
  getActiveConnection(): Promise<StoredConnection | null>;
  saveConnection(sealed: string, scopes: readonly string[], actor: string): Promise<string>;
  endConnection(status: "revoked" | "expired" | "error", errorCode: string | null, actor: string): Promise<void>;
  touchConnection(id: string): Promise<void>;
  listLocations(): Promise<StoredLocation[]>;
  /** One store with the evidence of its last match attempt. Evidence is field names, booleans and one candidate's business title/street. */
  getLocationEvidence(storeCode: string): Promise<{ matchStatus: StoredLocation["matchStatus"]; evidence: Record<string, unknown> } | null>;
  clearLink(storeCode: string, actor: string): Promise<boolean>;
  recordLink(storeCode: string, account: string | null, location: string | null, status: MatchStatus | "confirmed", confidence: MatchConfidence, evidence: Record<string, unknown>, actor: string): Promise<string>;
  claimRun(requestedBy: string, mode: "dry_run" | "save"): Promise<string | null>;
  finishRun(runId: string, status: "succeeded" | "partial" | "failed" | "refused", stats: RunStats, errorCode: string | null, errorSummary: string | null): Promise<void>;
  applyReviews(runId: string, locationId: string, reviews: readonly NormalizedReview[], complete: boolean, apiTotals?: { total: number | null; average: number | null }): Promise<ApplyResult>;
  noteLocationFailure(runId: string, locationId: string, code: string): Promise<void>;
}

const LOCATION_COLUMNS = "id,store_code,display_name,match_status,google_account_name,google_location_name,is_active";

export function createSupabaseGoogleStore(client: SupabaseClient = getSupabaseAdmin()): GoogleReviewsStore {
  const rpc = async <T>(fn: string, args: Record<string, unknown>, what: string): Promise<T> => {
    const { data, error } = await client.rpc(fn, args);
    if (error) fail(error, what);
    return scalar<T>(data);
  };

  return {
    async getActiveConnection() {
      const { data, error } = await client
        .from("google_business_connections")
        .select("id,refresh_token_sealed,scopes,connected_by,connected_at")
        .eq("status", "active")
        .maybeSingle();
      if (error) fail(error, "read the connection");
      if (!data) return null;
      const row = data as Record<string, unknown>;
      return {
        id: String(row.id),
        refreshTokenSealed: String(row.refresh_token_sealed),
        scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
        connectedBy: String(row.connected_by),
        connectedAt: String(row.connected_at),
      };
    },

    saveConnection: (sealed, scopes, actor) =>
      rpc<string>("google_review_set_connection", { p_sealed: sealed, p_scopes: [...scopes], p_actor: actor }, "save the connection"),

    async endConnection(status, errorCode, actor) {
      await rpc<null>("google_review_end_connection", { p_status: status, p_error_code: errorCode, p_actor: actor }, "end the connection");
    },

    async touchConnection(id) {
      const { error } = await client.from("google_business_connections").update({ last_used_at: new Date().toISOString() }).eq("id", id);
      if (error) fail(error, "record connection use");
    },

    async listLocations() {
      const { data, error } = await client.from("google_review_locations").select(LOCATION_COLUMNS).order("store_code", { ascending: true });
      if (error) fail(error, "read the stores");
      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        storeCode: String(row.store_code),
        displayName: String(row.display_name),
        matchStatus: row.match_status as StoredLocation["matchStatus"],
        googleAccountName: (row.google_account_name as string | null) ?? null,
        googleLocationName: (row.google_location_name as string | null) ?? null,
        isActive: row.is_active === true,
      }));
    },

    async getLocationEvidence(storeCode) {
      const { data, error } = await client.from("google_review_locations").select("match_status,match_evidence").eq("store_code", storeCode).maybeSingle();
      if (error) fail(error, "read a store's match evidence");
      if (!data) return null;
      const row = data as Record<string, unknown>;
      const evidence = row.match_evidence && typeof row.match_evidence === "object" ? (row.match_evidence as Record<string, unknown>) : {};
      return { matchStatus: row.match_status as StoredLocation["matchStatus"], evidence };
    },

    clearLink: (storeCode, actor) => rpc<boolean>("google_review_clear_link", { p_store_code: storeCode, p_actor: actor }, "clear a store link"),

    recordLink: (storeCode, account, location, status, confidence, evidence, actor) =>
      rpc<string>(
        "google_review_record_link",
        { p_store_code: storeCode, p_account: account, p_location: location, p_status: status, p_confidence: confidence, p_evidence: evidence, p_actor: actor },
        "record a store link",
      ),

    async claimRun(requestedBy, mode) {
      const id = await rpc<string | null>("google_review_claim_run", { p_requested_by: requestedBy, p_mode: mode }, "start a run");
      return id ?? null;
    },

    async finishRun(runId, status, stats, errorCode, errorSummary) {
      await rpc<null>(
        "google_review_finish_run",
        { p_run: runId, p_status: status, p_stats: stats, p_error_code: errorCode, p_error_summary: errorSummary },
        "finish a run",
      );
    },

    async applyReviews(runId, locationId, reviews, complete, apiTotals) {
      const payload = reviews.map((r) => ({
        google_review_id: r.googleReviewId,
        review_resource_name: r.resourceName,
        star_rating: r.starRating,
        comment: r.comment,
        review_create_time: r.createTime,
        review_update_time: r.updateTime,
        reply_comment: r.replyComment,
        reply_update_time: r.replyUpdateTime,
        reviewer_name: r.reviewerName,
        content_hash: r.contentHash,
      }));
      const result = await rpc<Partial<ApplyResult> | null>(
        "google_review_apply_reviews",
        { p_run: runId, p_location: locationId, p_reviews: payload, p_complete: complete, p_api_total: apiTotals?.total ?? null, p_api_average: apiTotals?.average ?? null },
        "save a store's reviews",
      );
      return { inserted: result?.inserted ?? 0, updated: result?.updated ?? 0, unchanged: result?.unchanged ?? 0, removed: result?.removed ?? 0, restored: result?.restored ?? 0 };
    },

    async noteLocationFailure(runId, locationId, code) {
      await rpc<null>("google_review_note_location_failure", { p_run: runId, p_location: locationId, p_code: code }, "note a store failure");
    },
  };
}
