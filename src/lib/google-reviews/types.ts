/**
 * Shared shapes for the Google Reviews integration. Plain data only.
 *
 * Of the reviewer only the display name is kept; the photo and profile URL are dropped in `normalize.ts`.
 */

/** A Business Profile account the connected Google user can administer: `accounts/{id}`. */
export interface GoogleAccount {
  /** `accounts/123456789` */
  readonly name: string;
  readonly accountName: string | null;
  readonly type: string | null;
}

/** A Business Profile location as the Business Information API lists it. */
export interface GoogleLocation {
  /** The account it was listed under: `accounts/123`. */
  readonly accountName: string;
  /** `locations/456` — Business Information API form. */
  readonly locationName: string;
  readonly title: string | null;
  /** The store code set in the profile, if any. Never inferred. */
  readonly storeCode: string | null;
  readonly address: {
    readonly lines: readonly string[];
    readonly locality: string | null;
    readonly administrativeArea: string | null;
    readonly postalCode: string | null;
  } | null;
}

/** One review, reduced to what Ask Bubbles keeps. */
export interface NormalizedReview {
  readonly googleReviewId: string;
  /** `accounts/{a}/locations/{l}/reviews/{id}` */
  readonly resourceName: string;
  readonly starRating: 1 | 2 | 3 | 4 | 5;
  readonly comment: string | null;
  readonly createTime: string;
  readonly updateTime: string;
  readonly replyComment: string | null;
  readonly replyUpdateTime: string | null;
  /** Reviewer display name only; null for anonymous reviewers. No photo, URL or id. */
  readonly reviewerName: string | null;
  /** sha256 over the fields that can change; equal hash ⇒ nothing to update. */
  readonly contentHash: string;
}

export type MatchStatus = "matched" | "candidate" | "mismatch" | "ambiguous" | "unmatched";
export type MatchConfidence = "none" | "low" | "medium" | "high";

export interface StoredConnection {
  readonly id: string;
  readonly refreshTokenSealed: string;
  readonly scopes: readonly string[];
  readonly connectedBy: string;
  readonly connectedAt: string;
}

export interface StoredLocation {
  readonly id: string;
  readonly storeCode: string;
  readonly displayName: string;
  readonly matchStatus: MatchStatus | "confirmed";
  readonly googleAccountName: string | null;
  readonly googleLocationName: string | null;
  readonly isActive: boolean;
}

/** Why a sync, a connection step or an API call did not complete. Codes only — never a token or a body. */
export type GoogleFailureCode =
  | "not_configured"
  | "disabled"
  | "writes_disabled"
  | "not_connected"
  | "authorization_expired"
  | "api_access_pending"
  | "api_disabled"
  | "permission_denied"
  | "quota_exceeded"
  | "rate_limited"
  | "unauthorized"
  | "not_found"
  | "server_error"
  | "network_error"
  | "bad_response"
  | "no_accounts"
  | "no_matched_stores"
  | "busy"
  | "removal_guard"
  | "store_error"
  | "time_budget_exceeded"
  | "unexpected";
