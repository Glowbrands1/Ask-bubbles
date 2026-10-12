import "server-only";

import { LIMITS } from "./config";
import type { GoogleAccount, GoogleFailureCode, GoogleLocation } from "./types";

/**
 * THE GOOGLE BUSINESS PROFILE API CLIENT — read-only, three calls.
 *
 *   listAccounts()                  Account Management API v1   GET /v1/accounts
 *   listLocations(account)          Business Information API v1 GET /v1/{account}/locations
 *   listReviews(account, location)  My Business API v4          GET /v4/{account}/{location}/reviews
 *
 * There is no other method, and the HTTP verb is a literal "GET" in one place.
 * Posting, replying to or deleting a review is not something this class can do.
 *
 * WHAT IT HANDLES
 *   PAGING     every list follows `nextPageToken`; a repeated token (a loop) or a
 *              page cap ends the read as INCOMPLETE, never as complete.
 *   PACING     at least `minRequestIntervalMs` between requests.
 *   RETRIES    429 (when Google names a wait ≤ 60 s), 5xx and dropped connections,
 *              with exponential backoff, at most `maxRetries`. Nothing else is
 *              retried — a 403 retried is a 403.
 *   401        one forced token refresh and one retry; a second 401 is
 *              `unauthorized` and the caller treats the grant as expired.
 *   ERRORS     classified to a closed list of codes. Google's response bodies are
 *              never kept: they can quote account and project identifiers.
 *
 * THE ONE ERROR WORTH KNOWING: while a Google Cloud project has not been APPROVED
 * for the Business Profile APIs, every call fails with HTTP 429 and a quota limit
 * of 0. That is not rate limiting and waiting does not help; it is reported as
 * `api_access_pending` so the screen can say so plainly.
 */

const ACCOUNT_MANAGEMENT = "https://mybusinessaccountmanagement.googleapis.com";
const BUSINESS_INFORMATION = "https://mybusinessbusinessinformation.googleapis.com";
const MY_BUSINESS_V4 = "https://mybusiness.googleapis.com";
const REQUEST_TIMEOUT_MS = 20_000;

export class GoogleApiError extends Error {
  readonly code: GoogleFailureCode;
  readonly status: number | null;
  readonly retryAfterMs: number | null;
  constructor(code: GoogleFailureCode, status: number | null = null, retryAfterMs: number | null = null) {
    super(`Google Business Profile API: ${code}${status ? ` (HTTP ${status})` : ""}`);
    this.name = "GoogleApiError";
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface GoogleBusinessClientOptions {
  /** A currently valid access token. Called before every request; the caller caches and refreshes. */
  getAccessToken: () => Promise<string>;
  /** Called once after a 401 so the next `getAccessToken` mints a new token. */
  forceRefresh?: () => void;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  minRequestIntervalMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  maxRetryAfterMs?: number;
}

export interface ReviewPage {
  /** The raw review objects, unvalidated. `normalize.ts` is the only place that reads their fields. */
  reviews: unknown[];
  /** True only when every page was read to the end. */
  complete: boolean;
  pages: number;
  totalReviewCount: number | null;
  averageRating: number | null;
}

/** Reasons Google puts in `error.details[].reason`, and quota facts in `.metadata`. */
interface ErrorFacts {
  status: string | null;
  reasons: string[];
  quotaLimitValue: string | null;
  message: string;
}

function readErrorFacts(body: unknown): ErrorFacts {
  const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  const e = (error && typeof error === "object" ? error : {}) as { status?: unknown; message?: unknown; details?: unknown };
  const reasons: string[] = [];
  let quotaLimitValue: string | null = null;
  if (Array.isArray(e.details)) {
    for (const d of e.details) {
      if (!d || typeof d !== "object") continue;
      const detail = d as { reason?: unknown; metadata?: unknown };
      if (typeof detail.reason === "string") reasons.push(detail.reason);
      const meta = detail.metadata && typeof detail.metadata === "object" ? (detail.metadata as Record<string, unknown>) : null;
      if (meta && typeof meta.quota_limit_value === "string") quotaLimitValue = meta.quota_limit_value;
    }
  }
  return {
    status: typeof e.status === "string" ? e.status : null,
    reasons,
    quotaLimitValue,
    // Used for classification only, then dropped. Never stored or returned.
    message: typeof e.message === "string" ? e.message.slice(0, 600) : "",
  };
}

export function classifyGoogleError(status: number, body: unknown, retryAfterMs: number | null = null): GoogleApiError {
  const f = readErrorFacts(body);
  if (status === 401) return new GoogleApiError("unauthorized", status);

  const notEnabled = f.reasons.includes("SERVICE_DISABLED") || /has not been used in project|is disabled|API has not been enabled/i.test(f.message);
  if (status === 403 && notEnabled) return new GoogleApiError("api_disabled", status);

  // Google states the project's quota in structured metadata. A limit of "0" is the signature of a project that
  // has not been approved for the Business Profile APIs; message text is not trusted for this decision.
  const quotaZero = f.quotaLimitValue === "0";
  const exhausted = status === 429 || f.status === "RESOURCE_EXHAUSTED" || f.reasons.includes("RATE_LIMIT_EXCEEDED") || f.reasons.includes("RESOURCE_EXHAUSTED");
  if (exhausted && quotaZero) return new GoogleApiError("api_access_pending", status);
  if (exhausted) {
    const daily = /per day|daily/i.test(f.message);
    return new GoogleApiError(daily ? "quota_exceeded" : "rate_limited", status, retryAfterMs);
  }

  if (status === 403) return new GoogleApiError("permission_denied", status);
  if (status === 404) return new GoogleApiError("not_found", status);
  if (status >= 500) return new GoogleApiError("server_error", status, retryAfterMs);
  return new GoogleApiError("bad_response", status);
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
}

const NAME_ACCOUNT = /^accounts\/[0-9]{1,30}$/;
const NAME_LOCATION = /^locations\/[0-9]{1,30}$/;

export class GoogleBusinessClient {
  requestsMade = 0;
  private lastRequestAt = 0;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly minInterval: number;
  private readonly maxRetries: number;
  private readonly baseBackoff: number;
  private readonly maxRetryAfter: number;

  constructor(private readonly options: GoogleBusinessClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
    this.minInterval = options.minRequestIntervalMs ?? LIMITS.minRequestIntervalMs;
    this.maxRetries = options.maxRetries ?? LIMITS.maxRetries;
    this.baseBackoff = options.baseBackoffMs ?? LIMITS.baseBackoffMs;
    this.maxRetryAfter = options.maxRetryAfterMs ?? LIMITS.maxRetryAfterMs;
  }

  /* ------------------------------------------------------------ transport -- */

  private async getJson(url: string): Promise<unknown> {
    let refreshed = false;
    for (let attempt = 0; ; attempt += 1) {
      const wait = this.lastRequestAt + this.minInterval - this.now();
      if (this.lastRequestAt > 0 && wait > 0) await this.sleep(wait);
      this.lastRequestAt = this.now();
      this.requestsMade += 1;

      const token = await this.options.getAccessToken();
      let response: Response;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        response = await this.fetchImpl(url, {
          method: "GET",
          redirect: "error",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
      } catch {
        // The message of a fetch failure can contain the URL; only the fact is kept.
        if (attempt < this.maxRetries) {
          await this.sleep(this.baseBackoff * 2 ** attempt);
          continue;
        }
        throw new GoogleApiError("network_error");
      } finally {
        clearTimeout(timer);
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (response.ok) {
        if (body === null || typeof body !== "object") throw new GoogleApiError("bad_response", response.status);
        return body;
      }

      const error = classifyGoogleError(response.status, body, parseRetryAfter(response.headers.get("retry-after")));
      if (error.code === "unauthorized" && !refreshed && this.options.forceRefresh) {
        refreshed = true;
        this.options.forceRefresh();
        continue;
      }
      const transient = error.code === "server_error" || (error.code === "rate_limited" && (error.retryAfterMs === null || error.retryAfterMs <= this.maxRetryAfter));
      if (transient && attempt < this.maxRetries) {
        const wait429 = error.retryAfterMs !== null ? Math.min(error.retryAfterMs, this.maxRetryAfter) : 0;
        await this.sleep(Math.max(wait429, this.baseBackoff * 2 ** attempt));
        continue;
      }
      throw error;
    }
  }

  /* ---------------------------------------------------------- the three reads -- */

  async listAccounts(): Promise<GoogleAccount[]> {
    const accounts: GoogleAccount[] = [];
    const seen = new Set<string>();
    let pageToken: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      const url = new URL(`${ACCOUNT_MANAGEMENT}/v1/accounts`);
      url.searchParams.set("pageSize", "20");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const body = (await this.getJson(url.toString())) as { accounts?: unknown; nextPageToken?: unknown };
      for (const raw of Array.isArray(body.accounts) ? body.accounts : []) {
        const a = raw as { name?: unknown; accountName?: unknown; type?: unknown };
        if (typeof a.name !== "string" || !NAME_ACCOUNT.test(a.name)) continue;
        accounts.push({ name: a.name, accountName: typeof a.accountName === "string" ? a.accountName.slice(0, 200) : null, type: typeof a.type === "string" ? a.type : null });
      }
      pageToken = this.nextToken(body.nextPageToken, seen);
      if (!pageToken) return accounts;
    }
    throw new GoogleApiError("bad_response");
  }

  async listLocations(accountName: string): Promise<GoogleLocation[]> {
    if (!NAME_ACCOUNT.test(accountName)) throw new GoogleApiError("bad_response");
    const out: GoogleLocation[] = [];
    const seen = new Set<string>();
    let pageToken: string | null = null;
    for (let page = 0; page < 50; page += 1) {
      const url = new URL(`${BUSINESS_INFORMATION}/v1/${accountName}/locations`);
      url.searchParams.set("readMask", "name,title,storeCode,storefrontAddress");
      url.searchParams.set("pageSize", String(LIMITS.locationPageSize));
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const body = (await this.getJson(url.toString())) as { locations?: unknown; nextPageToken?: unknown };
      for (const raw of Array.isArray(body.locations) ? body.locations : []) {
        const l = raw as { name?: unknown; title?: unknown; storeCode?: unknown; storefrontAddress?: unknown };
        if (typeof l.name !== "string" || !NAME_LOCATION.test(l.name)) continue;
        const addr = l.storefrontAddress && typeof l.storefrontAddress === "object" ? (l.storefrontAddress as Record<string, unknown>) : null;
        out.push({
          accountName,
          locationName: l.name,
          title: typeof l.title === "string" ? l.title.slice(0, 300) : null,
          storeCode: typeof l.storeCode === "string" && l.storeCode.trim() ? l.storeCode.trim().slice(0, 64) : null,
          address: addr
            ? {
                lines: Array.isArray(addr.addressLines) ? addr.addressLines.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 200)).slice(0, 6) : [],
                locality: typeof addr.locality === "string" ? addr.locality : null,
                administrativeArea: typeof addr.administrativeArea === "string" ? addr.administrativeArea : null,
                postalCode: typeof addr.postalCode === "string" ? addr.postalCode : null,
              }
            : null,
        });
      }
      pageToken = this.nextToken(body.nextPageToken, seen);
      if (!pageToken) return out;
    }
    throw new GoogleApiError("bad_response");
  }

  /**
   * Every review of one location, newest-updated first. `complete` is true only
   * if the last page returned no `nextPageToken`; hitting the page cap, the
   * deadline, or a repeated token ends the read INCOMPLETE.
   */
  async listReviews(accountName: string, locationName: string, options: { maxPages?: number; deadline?: number } = {}): Promise<ReviewPage> {
    if (!NAME_ACCOUNT.test(accountName) || !NAME_LOCATION.test(locationName)) throw new GoogleApiError("bad_response");
    const maxPages = options.maxPages ?? LIMITS.maxPagesPerLocation;
    const reviews: unknown[] = [];
    const seen = new Set<string>();
    let pageToken: string | null = null;
    let totalReviewCount: number | null = null;
    let averageRating: number | null = null;
    let pages = 0;

    while (pages < maxPages) {
      if (options.deadline !== undefined && this.now() > options.deadline) return { reviews, complete: false, pages, totalReviewCount, averageRating };
      const url = new URL(`${MY_BUSINESS_V4}/v4/${accountName}/${locationName}/reviews`);
      url.searchParams.set("pageSize", String(LIMITS.pageSize));
      url.searchParams.set("orderBy", "updateTime desc");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const body = (await this.getJson(url.toString())) as { reviews?: unknown; nextPageToken?: unknown; totalReviewCount?: unknown; averageRating?: unknown };
      pages += 1;
      if (Array.isArray(body.reviews)) reviews.push(...body.reviews);
      if (typeof body.totalReviewCount === "number") totalReviewCount = body.totalReviewCount;
      if (typeof body.averageRating === "number") averageRating = body.averageRating;
      let next: string | null;
      try {
        next = this.nextToken(body.nextPageToken, seen);
      } catch {
        // A token we were already given: Google is looping. What we have is not the whole list.
        return { reviews, complete: false, pages, totalReviewCount, averageRating };
      }
      if (!next) return { reviews, complete: true, pages, totalReviewCount, averageRating };
      pageToken = next;
    }
    return { reviews, complete: false, pages, totalReviewCount, averageRating };
  }

  /** Returns the next token, or null at the end; throws if the token was already seen. */
  private nextToken(value: unknown, seen: Set<string>): string | null {
    if (typeof value !== "string" || value.length === 0) return null;
    if (seen.has(value)) throw new GoogleApiError("bad_response");
    seen.add(value);
    return value;
  }
}
