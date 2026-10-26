import "server-only";

/**
 * GOOGLE REVIEWS — CONFIGURATION, BY NAME.
 *
 * Nothing here returns, logs or interpolates a secret VALUE. Readiness reports
 * which variables are missing by NAME only.
 *
 * THREE SWITCHES, EACH ON ITS OWN, ALL OFF BY DEFAULT (the same discipline as
 * the Woven employee sync):
 *
 *   GOOGLE_REVIEWS_SYNC_ENABLED       the master switch. Off: nothing reaches Google.
 *   GOOGLE_REVIEWS_WRITES_ENABLED     a sync may SAVE. Off: only dry runs (read
 *                                     Google, compare, write nothing).
 *   GOOGLE_REVIEWS_SCHEDULE_ENABLED   the scheduled refresh. Off: manual runs
 *                                     still work, the cron tick starts nothing.
 *
 * THIS INTEGRATION IS READ-ONLY AGAINST GOOGLE. There is no switch that posts,
 * edits or deletes a review reply, because there is no code that can.
 *
 * CREDENTIALS
 *   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET   the OAuth client of the
 *       Google Cloud project that has been APPROVED for the Business Profile APIs
 *   GOOGLE_TOKEN_ENCRYPTION_KEY    32 random bytes, base64 — seals the stored
 *       refresh token (AES-256-GCM). Never stored beside the data it protects.
 *   GOOGLE_OAUTH_REDIRECT_URI      optional; defaults to
 *       `${NEXT_PUBLIC_SITE_URL}/api/admin/google-reviews/callback`
 */

/** Any string map: `process.env` in production, a plain object in tests. */
export type EnvSource = Record<string, string | undefined>;

export const GOOGLE_OAUTH_CLIENT_ID_ENV = "GOOGLE_OAUTH_CLIENT_ID";
export const GOOGLE_OAUTH_CLIENT_SECRET_ENV = "GOOGLE_OAUTH_CLIENT_SECRET";
export const GOOGLE_TOKEN_ENCRYPTION_KEY_ENV = "GOOGLE_TOKEN_ENCRYPTION_KEY";
export const GOOGLE_OAUTH_REDIRECT_URI_ENV = "GOOGLE_OAUTH_REDIRECT_URI";
export const GOOGLE_REVIEWS_SYNC_ENABLED_ENV = "GOOGLE_REVIEWS_SYNC_ENABLED";
export const GOOGLE_REVIEWS_WRITES_ENABLED_ENV = "GOOGLE_REVIEWS_WRITES_ENABLED";
export const GOOGLE_REVIEWS_SCHEDULE_ENABLED_ENV = "GOOGLE_REVIEWS_SCHEDULE_ENABLED";
/** The /reviews notice when reviews have stopped syncing. Off by default; see `sync-health.ts`. */
export const GOOGLE_REVIEWS_STALE_BANNER_ENABLED_ENV = "GOOGLE_REVIEWS_STALE_BANNER_ENABLED";

export const CALLBACK_PATH = "/api/admin/google-reviews/callback";

/** What a run may do, and the limits it keeps. Not environment-tunable: a typo must not change a safety bound. */
export const LIMITS = {
  /** Reviews per page; the API's own maximum. */
  pageSize: 50,
  /** Pages read per location in one run. 200 × 50 = 10,000 reviews; beyond it the read is INCOMPLETE and nothing is marked removed. */
  maxPagesPerLocation: 200,
  /** Locations read per account listing page. The API's maximum. */
  locationPageSize: 100,
  /** The run stops starting new Google requests after this, leaving room to save inside the route's limit. */
  readBudgetMs: 240_000,
  /** At least this long between Google requests. Far under the default quota, and polite. */
  minRequestIntervalMs: 150,
  /** Retries of a transient failure (429 with a wait, 5xx, a dropped connection). */
  maxRetries: 3,
  baseBackoffMs: 500,
  /** The longest Retry-After we will sit through; longer than this and the call fails as rate_limited. */
  maxRetryAfterMs: 60_000,
} as const;

export interface GoogleReviewsConfig {
  enabled: boolean;
  writesEnabled: boolean;
  scheduleEnabled: boolean;
  /** Names of the OAuth/encryption variables not yet set. Never values. */
  missingCredentials: string[];
  /** Whether everything a live Google call needs is present. */
  credentialsReady: boolean;
}

function flag(env: EnvSource, name: string): boolean {
  return env[name]?.trim().toLowerCase() === "true";
}

function present(env: EnvSource, name: string): boolean {
  const v = env[name];
  return typeof v === "string" && v.trim().length > 0;
}

export function readGoogleReviewsConfig(env: EnvSource = process.env): GoogleReviewsConfig {
  const missing = [GOOGLE_OAUTH_CLIENT_ID_ENV, GOOGLE_OAUTH_CLIENT_SECRET_ENV, GOOGLE_TOKEN_ENCRYPTION_KEY_ENV].filter(
    (name) => !present(env, name),
  );
  return {
    enabled: flag(env, GOOGLE_REVIEWS_SYNC_ENABLED_ENV),
    writesEnabled: flag(env, GOOGLE_REVIEWS_WRITES_ENABLED_ENV),
    scheduleEnabled: flag(env, GOOGLE_REVIEWS_SCHEDULE_ENABLED_ENV),
    missingCredentials: missing,
    credentialsReady: missing.length === 0,
  };
}

/**
 * Whether /reviews says so when reviews have stopped syncing. Read like the
 * chat flags (`envFlag`): "1", "true", "on" or "yes", any case, trimmed. The
 * sibling app reads the same flag the same way, so one setting means the
 * same in both (QA-2, 26 Oct 2026).
 */
export function staleBannerEnabled(env: EnvSource = process.env): boolean {
  return ["1", "true", "on", "yes"].includes(env[GOOGLE_REVIEWS_STALE_BANNER_ENABLED_ENV]?.trim().toLowerCase() ?? "");
}

export interface OAuthSettings {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** The redirect URI the Google Cloud OAuth client must list. Null when it cannot be determined. */
export function resolveRedirectUri(env: EnvSource = process.env, requestOrigin?: string): string | null {
  const explicit = env[GOOGLE_OAUTH_REDIRECT_URI_ENV]?.trim();
  if (explicit) return explicit;
  const base = env.NEXT_PUBLIC_SITE_URL?.trim() || requestOrigin;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}${CALLBACK_PATH}`;
}

export function readOAuthSettings(env: EnvSource = process.env, requestOrigin?: string): OAuthSettings | null {
  const clientId = env[GOOGLE_OAUTH_CLIENT_ID_ENV]?.trim();
  const clientSecret = env[GOOGLE_OAUTH_CLIENT_SECRET_ENV]?.trim();
  const redirectUri = resolveRedirectUri(env, requestOrigin);
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}
