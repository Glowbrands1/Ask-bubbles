import "server-only";

import { APPROVED_GOOGLE_STORES } from "@/config/company/google-reviews";

import { GoogleApiError, GoogleBusinessClient } from "./client";
import { LIMITS, readGoogleReviewsConfig, readOAuthSettings, type GoogleReviewsConfig, type OAuthSettings } from "./config";
import { REFRESH_TOKEN_LABEL, SealError, open, readEncryptionKey } from "./crypto";
import { matchApprovedStores } from "./matching";
import { normalizeReviews } from "./normalize";
import { OAuthError, refreshAccessToken, type AccessToken } from "./oauth";
import { GoogleStoreError, createSupabaseGoogleStore, type ApplyResult, type GoogleReviewsStore, type RunStats } from "./store";
import type { GoogleAccount, GoogleFailureCode, GoogleLocation, StoredLocation } from "./types";

/**
 * THE GOOGLE REVIEWS SYNC — read Google, link the seven stores, save their reviews.
 *
 * ============================================================================
 * WHAT A RUN DOES, IN ORDER
 * ============================================================================
 *   1. Gates: the master switch, the writes switch (for a save), credentials.
 *   2. Claims the single run lock (Postgres enforces one running sync).
 *   3. Opens the stored connection's refresh token and mints an access token.
 *   4. Lists the Business Profile accounts, then every location in them.
 *   5. Matches Google's locations to the SEVEN approved stores (`matching.ts`):
 *      an exact store code AND address. Another brand's profile is dropped on
 *      sight; the rest of the account is counted and ignored.
 *   6. For each linked store, reads ALL of its reviews, one store at a time.
 *   7. Saves each store's reviews in one transaction (`google_review_apply_reviews`).
 *
 * ============================================================================
 * WHAT IT CAN NEVER DO
 * ============================================================================
 *   - Write to Google. The client has three read methods and nothing else.
 *   - Store a review for any store but the seven, or file one under the wrong
 *     one: the database refuses it (allowlist foreign key + resource-name trigger).
 *   - Delete anything. A review Google stops returning is MARKED removed, and
 *     only after a COMPLETE, error-free read of that store.
 *   - Treat a partial read as complete. A review Google returned that we could
 *     not read, a page cap, a looping page token, a deadline, or a review count
 *     smaller than Google's own total all leave the read INCOMPLETE — nothing is
 *     then marked removed for that store.
 *   - Let one store's failure stop the others, or hide it: the run is `partial`
 *     and the store's failure code is on the screen.
 *   - Return or log a review's text, a reviewer, a token or a Google error body.
 *     The outcome is codes and counts.
 *
 * A DRY RUN reads Google and compares, and writes nothing except its own run
 * row. A SAVE needs GOOGLE_REVIEWS_WRITES_ENABLED.
 */

export const CRON_REQUESTER = "cron:google-reviews";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface SyncDependencies {
  config?: GoogleReviewsConfig;
  oauth?: OAuthSettings | null;
  store?: GoogleReviewsStore;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Test seam: the AES key. Production reads GOOGLE_TOKEN_ENCRYPTION_KEY. */
  encryptionKey?: Buffer;
  /** Test seam: shorter limits. */
  limits?: Partial<{ readBudgetMs: number; maxPagesPerLocation: number }>;
}

export interface SyncOptions extends SyncDependencies {
  requestedBy: string;
  dryRun?: boolean;
}

export type SyncStatus = "succeeded" | "partial" | "failed" | "refused" | "disabled" | "not_configured" | "busy";

export interface StoreOutcome {
  storeCode: string;
  link: "matched" | "confirmed" | "candidate" | "mismatch" | "ambiguous" | "unmatched";
  /** True when the store's reviews were read. */
  read: boolean;
  complete: boolean;
  reviewsFetched: number;
  rejected: number;
  applied: ApplyResult | null;
  failure: GoogleFailureCode | "confirmed_link_not_found" | null;
}

export interface SyncOutcome {
  status: SyncStatus;
  mode: "dry_run" | "save";
  code: GoogleFailureCode | null;
  reason: string | null;
  runId: string | null;
  /** Variables missing, by name, when not configured. */
  missing: string[];
  accountsListed: number;
  googleLocationsSeen: number;
  blockedOtherBrand: number;
  ignoredNotApproved: number;
  storesLinked: number;
  storesTotal: number;
  stores: StoreOutcome[];
  totals: { fetched: number; inserted: number; updated: number; unchanged: number; removed: number; restored: number; rejected: number };
}

const blankTotals = () => ({ fetched: 0, inserted: 0, updated: 0, unchanged: 0, removed: 0, restored: 0, rejected: 0 });

function blank(mode: SyncOutcome["mode"], status: SyncStatus, code: GoogleFailureCode | null, reason: string | null, missing: string[] = []): SyncOutcome {
  return {
    status, mode, code, reason, runId: null, missing, accountsListed: 0, googleLocationsSeen: 0, blockedOtherBrand: 0, ignoredNotApproved: 0,
    storesLinked: 0, storesTotal: APPROVED_GOOGLE_STORES.length, stores: [], totals: blankTotals(),
  };
}

export function outcomeHttpStatus(outcome: SyncOutcome): number {
  switch (outcome.status) {
    case "succeeded":
    case "partial":
    case "disabled":
      return 200;
    case "busy":
    case "refused":
      return 409;
    case "not_configured":
      return 503;
    default:
      return outcome.code === "authorization_expired" || outcome.code === "not_connected" ? 409 : 502;
  }
}

const REASONS: Partial<Record<GoogleFailureCode, string>> = {
  not_connected: "No Google account is connected. Connect one to start.",
  authorization_expired: "Google no longer accepts the saved authorization. Reconnect the Google account.",
  api_access_pending: "Google has not yet approved this Google Cloud project for the Business Profile APIs, so every request is refused with a zero quota. This clears when Google approves the access request.",
  api_disabled: "A Business Profile API is not enabled in the Google Cloud project.",
  permission_denied: "The connected Google account is not allowed to read this data.",
  quota_exceeded: "Google's daily quota for this project is used up. The next scheduled run will try again.",
  rate_limited: "Google is rate limiting this project. The next run will try again.",
  no_accounts: "The connected Google account manages no Business Profile accounts.",
  no_matched_stores: "None of the seven approved stores matched a Business Profile location.",
  network_error: "Google could not be reached.",
  server_error: "Google returned a server error.",
  bad_response: "Google's answer was not in the expected shape.",
  store_error: "The database could not save the result.",
  time_budget_exceeded: "The run ran out of time before every store was read.",
  unexpected: "The run stopped unexpectedly. Nothing was lost; the next run will try again.",
};

export async function runGoogleReviewsSync(options: SyncOptions): Promise<SyncOutcome> {
  const dryRun = options.dryRun ?? false;
  const mode: SyncOutcome["mode"] = dryRun ? "dry_run" : "save";
  const config = options.config ?? readGoogleReviewsConfig();

  if (!config.enabled) return blank(mode, "disabled", "disabled", "GOOGLE_REVIEWS_SYNC_ENABLED is not on, so nothing reaches Google.");
  if (!dryRun && !config.writesEnabled) {
    return blank(mode, "refused", "writes_disabled", "GOOGLE_REVIEWS_WRITES_ENABLED is not on, so a sync may not save. A dry run is still allowed.");
  }
  const oauth = options.oauth === undefined ? readOAuthSettings() : options.oauth;
  if (!config.credentialsReady || !oauth) {
    const missing = [...config.missingCredentials];
    return blank(mode, "not_configured", "not_configured", missing.length ? `Missing: ${missing.join(", ")}.` : "The OAuth redirect address could not be determined (set NEXT_PUBLIC_SITE_URL or GOOGLE_OAUTH_REDIRECT_URI).", missing);
  }

  const store = options.store ?? createSupabaseGoogleStore();
  const now = options.now ?? Date.now;
  const limits = { ...LIMITS, ...options.limits };
  const outcome = blank(mode, "failed", null, null);

  let runId: string | null;
  try {
    runId = await store.claimRun(options.requestedBy, mode);
  } catch {
    return { ...outcome, code: "store_error", reason: REASONS.store_error ?? null };
  }
  if (!runId) return blank(mode, "busy", "busy", "Another Google Reviews sync is running.");
  outcome.runId = runId;

  const finish = async (status: "succeeded" | "partial" | "failed", code: GoogleFailureCode | null): Promise<SyncOutcome> => {
    outcome.status = status;
    outcome.code = code;
    outcome.reason = code ? (REASONS[code] ?? null) : null;
    outcome.storesLinked = outcome.stores.filter((s) => s.link === "matched" || s.link === "confirmed").length;
    const stats: RunStats = {
      accounts: outcome.accountsListed,
      google_locations_seen: outcome.googleLocationsSeen,
      blocked_other_brand: outcome.blockedOtherBrand,
      ignored_not_approved: outcome.ignoredNotApproved,
      stores_linked: outcome.storesLinked,
      stores_total: outcome.storesTotal,
      rejected: outcome.totals.rejected,
      link_statuses: outcome.stores.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.link]: (acc[s.link] ?? 0) + 1 }), {}),
      store_failures: outcome.stores.reduce<Record<string, number>>((acc, s) => (s.failure ? { ...acc, [s.failure]: (acc[s.failure] ?? 0) + 1 } : acc), {}),
    };
    try {
      await store.finishRun(runId!, status, stats, code, code ? (REASONS[code] ?? null) : null);
    } catch {
      /* The run row stays 'running' and is abandoned by the next claim; the outcome below is still truthful. */
    }
    return outcome;
  };

  try {
    // ---- the connection and an access token ----------------------------------------------------------
    const connection = await store.getActiveConnection();
    if (!connection) return await finish("failed", "not_connected");

    let refreshToken: string;
    try {
      refreshToken = open(connection.refreshTokenSealed, REFRESH_TOKEN_LABEL, options.encryptionKey ?? readEncryptionKey());
    } catch (error) {
      // Cannot read our own sealed token: a key problem, not a Google problem. The connection is NOT ended.
      return await finish("failed", error instanceof SealError ? "not_configured" : "unexpected");
    }

    let accessToken: AccessToken | null = null;
    const getAccessToken = async () => {
      if (!accessToken || now() >= accessToken.expiresAt) accessToken = await refreshAccessToken(oauth, refreshToken, options.fetchImpl, now);
      return accessToken.value;
    };
    const client = new GoogleBusinessClient({ getAccessToken, forceRefresh: () => { accessToken = null; }, fetchImpl: options.fetchImpl, sleep: options.sleep, now });

    const expire = async (reason: string) => {
      if (!dryRun) {
        try {
          await store.endConnection("expired", reason, options.requestedBy);
        } catch {
          /* best effort */
        }
      }
    };

    // ---- accounts and locations -----------------------------------------------------------------------
    let accounts: GoogleAccount[];
    try {
      accounts = await client.listAccounts();
      if (!dryRun) await store.touchConnection(connection.id).catch(() => undefined);
    } catch (error) {
      return await failFromError(error, finish, expire);
    }
    outcome.accountsListed = accounts.length;
    if (accounts.length === 0) return await finish("failed", "no_accounts");

    const googleLocations: GoogleLocation[] = [];
    const seenLocations = new Set<string>();
    let firstListError: GoogleFailureCode | null = null;
    for (const account of accounts) {
      try {
        for (const location of await client.listLocations(account.name)) {
          const key = `${location.accountName}/${location.locationName}`;
          if (!seenLocations.has(key)) {
            seenLocations.add(key);
            googleLocations.push(location);
          }
        }
      } catch (error) {
        if (error instanceof GoogleApiError && error.code === "unauthorized") return await failFromError(error, finish, expire);
        if (error instanceof GoogleApiError && (error.code === "api_access_pending" || error.code === "api_disabled")) return await failFromError(error, finish, expire);
        firstListError ??= error instanceof GoogleApiError ? error.code : "unexpected";
      }
    }
    if (googleLocations.length === 0 && firstListError) return await finish("failed", firstListError);

    // ---- match the seven stores ------------------------------------------------------------------------
    const report = matchApprovedStores(googleLocations);
    outcome.googleLocationsSeen = report.googleLocationsSeen;
    outcome.blockedOtherBrand = report.blockedOtherBrand;
    outcome.ignoredNotApproved = report.ignoredNotApproved;

    const stored = await store.listLocations();
    const storedByCode = new Map<string, StoredLocation>(stored.map((s) => [s.storeCode, s]));
    const targets: { storeCode: string; storeId: string; account: string; location: string; link: "matched" | "confirmed" }[] = [];

    for (const match of report.stores) {
      const row = storedByCode.get(match.store.code);
      const result: StoreOutcome = { storeCode: match.store.code, link: match.status, read: false, complete: false, reviewsFetched: 0, rejected: 0, applied: null, failure: null };
      outcome.stores.push(result);
      if (!row) {
        result.failure = "store_error";
        continue;
      }

      if (row.matchStatus === "confirmed" && row.googleAccountName && row.googleLocationName) {
        // An administrator's confirmation stands. It must still exist in Google's listing, or the store is skipped (never downgraded).
        result.link = "confirmed";
        if (seenLocations.has(`${row.googleAccountName}/${row.googleLocationName}`)) {
          targets.push({ storeCode: row.storeCode, storeId: row.id, account: row.googleAccountName, location: row.googleLocationName, link: "confirmed" });
        } else {
          result.failure = "confirmed_link_not_found";
        }
        continue;
      }

      if (!dryRun) {
        try {
          await store.recordLink(match.store.code, match.accountName, match.locationName, match.status, match.confidence, { ...match.evidence }, options.requestedBy);
        } catch {
          // e.g. the Google location is already held by another store: this store is left unlinked and reported, the rest continue.
          result.failure = "store_error";
          continue;
        }
      }
      if (match.status === "matched" && match.accountName && match.locationName) {
        targets.push({ storeCode: match.store.code, storeId: row.id, account: match.accountName, location: match.locationName, link: "matched" });
      }
    }
    if (targets.length === 0) return await finish("failed", "no_matched_stores");

    // ---- read and save each linked store, one at a time -------------------------------------------------
    const deadline = now() + limits.readBudgetMs;
    let timedOut = false;
    for (const target of targets) {
      const result = outcome.stores.find((s) => s.storeCode === target.storeCode)!;
      if (now() > deadline) {
        timedOut = true;
        result.failure = "time_budget_exceeded";
        continue;
      }
      try {
        const page = await client.listReviews(target.account, target.location, { maxPages: limits.maxPagesPerLocation, deadline });
        const batch = normalizeReviews(page.reviews, { accountName: target.account, locationName: target.location });
        // COMPLETE only if every page was read, every review was understood, and Google's own total is not larger than what we hold.
        const countOk = page.totalReviewCount === null || batch.reviews.length >= page.totalReviewCount;
        const complete = page.complete && batch.rejectedTotal === 0 && countOk;

        result.read = true;
        result.complete = complete;
        result.reviewsFetched = batch.reviews.length;
        result.rejected = batch.rejectedTotal;
        outcome.totals.fetched += batch.reviews.length;
        outcome.totals.rejected += batch.rejectedTotal;
        if (!page.complete && now() > deadline) timedOut = true;

        if (!dryRun) {
          try {
            const applied = await store.applyReviews(runId, target.storeId, batch.reviews, complete, { total: page.totalReviewCount, average: page.averageRating });
            result.applied = applied;
            outcome.totals.inserted += applied.inserted;
            outcome.totals.updated += applied.updated;
            outcome.totals.unchanged += applied.unchanged;
            outcome.totals.removed += applied.removed;
            outcome.totals.restored += applied.restored;
          } catch (error) {
            result.failure = error instanceof GoogleStoreError ? error.code : "store_error";
            await store.noteLocationFailure(runId, target.storeId, result.failure).catch(() => undefined);
          }
        }
      } catch (error) {
        if (error instanceof GoogleApiError && error.code === "unauthorized") return await failFromError(error, finish, expire);
        result.failure = error instanceof GoogleApiError ? error.code : error instanceof OAuthError && error.code === "invalid_grant" ? "authorization_expired" : "unexpected";
        if (error instanceof OAuthError && error.code === "invalid_grant") {
          await expire("invalid_grant");
          return await finish("failed", "authorization_expired");
        }
        if (!dryRun) await store.noteLocationFailure(runId, target.storeId, result.failure).catch(() => undefined);
      }
    }

    // ---- the verdict -------------------------------------------------------------------------------------
    const anyRead = outcome.stores.some((s) => s.read);
    const allSeven = outcome.stores.length === APPROVED_GOOGLE_STORES.length && outcome.stores.every((s) => (s.link === "matched" || s.link === "confirmed") && s.read && s.complete && !s.failure);
    if (!anyRead) return await finish("failed", outcome.stores.find((s) => s.failure)?.failure as GoogleFailureCode | undefined ?? "unexpected");
    if (allSeven && !timedOut) return await finish("succeeded", null);
    return await finish("partial", timedOut ? "time_budget_exceeded" : null);
  } catch (error) {
    if (error instanceof OAuthError) {
      if (error.code === "invalid_grant") {
        if (!dryRun) await store.endConnection("expired", "invalid_grant", options.requestedBy).catch(() => undefined);
        return await finish("failed", "authorization_expired");
      }
      return await finish("failed", error.code === "invalid_client" ? "not_configured" : error.code === "network_error" ? "network_error" : "bad_response");
    }
    if (error instanceof GoogleApiError) return await failFromError(error, finish, async () => undefined);
    if (error instanceof GoogleStoreError) return await finish("failed", error.code === "busy" ? "busy" : "store_error");
    return await finish("failed", "unexpected");
  }
}

/** A Google call failed outright: end the connection when the grant is dead, and report the code. */
async function failFromError(
  error: unknown,
  finish: (status: "succeeded" | "partial" | "failed", code: GoogleFailureCode | null) => Promise<SyncOutcome>,
  expire: (reason: string) => Promise<void>,
): Promise<SyncOutcome> {
  if (error instanceof OAuthError) {
    if (error.code === "invalid_grant") {
      await expire("invalid_grant");
      return finish("failed", "authorization_expired");
    }
    return finish("failed", error.code === "invalid_client" ? "not_configured" : error.code === "network_error" ? "network_error" : "bad_response");
  }
  if (error instanceof GoogleApiError) {
    if (error.code === "unauthorized") {
      await expire("unauthorized");
      return finish("failed", "authorization_expired");
    }
    return finish("failed", error.code);
  }
  return finish("failed", "unexpected");
}
