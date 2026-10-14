import "server-only";

import { GoogleApiError } from "./client";
import { readGoogleReviewsConfig, readOAuthSettings, type GoogleReviewsConfig, type OAuthSettings } from "./config";
import { REFRESH_TOKEN_LABEL, SealError, open as openSealed, readEncryptionKey } from "./crypto";
import { OAuthError, refreshAccessToken, type AccessToken } from "./oauth";
import { canReplyForStore, type ReplyActor } from "./reply-access";
import { GoogleReplyClient } from "./reply-client";
import { ReplyStoreError, createSupabaseReplyStore, isUuid, type ReplyRecord, type ReplyStore, type ReviewReplyContext } from "./reply-store";
import { createSupabaseGoogleStore, type GoogleReviewsStore } from "./store";
export { REPLY_REASONS } from "./reply-view";

/**
 * REPLYING TO A GOOGLE REVIEW — draft, edit, discard, publish.
 *
 * ============================================================================
 * THE RULES, IN THE ORDER THEY ARE CHECKED ON A PUBLISH
 * ============================================================================
 *   1. SWITCHES     GOOGLE_REVIEWS_SYNC_ENABLED and GOOGLE_REVIEWS_REPLIES_ENABLED, credentials,
 *                   and a stored Google connection. Off ⇒ nothing is sent. (Drafting needs none.)
 *   2. WHO          `canReplyForStore`: verified identity + `reply_to_reviews` + the review's salon is in
 *                   the person's assignment. Re-checked here, so no route can forget it.
 *   3. CONFIRMATION `confirmPublish: true` (always) and `confirmReplace: true` when the review already has
 *                   an owner reply. The named `version` is the exact text the person confirmed; if the
 *                   draft was edited since, nothing is sent.
 *   4. UNKNOWN      A reply left `publishing` past the window (a crash, a lost response) is set to
 *                   `failed/outcome_unknown` first, never assumed sent or unsent.
 *   5. PRE-FLIGHT   Google is READ for this one review. If it already holds exactly this text, the reply
 *                   is recorded as published WITHOUT sending anything (this is how a lost response is
 *                   reconciled and why a retry can never double-post). If the reply on Google is not the
 *                   one the draft was started from (someone answered or edited it elsewhere), nothing is
 *                   sent: `reply_changed`.
 *   6. CLAIM        One database transition draft/failed → publishing. A second click, a second tab or a
 *                   second person finds it already `publishing` and is refused (`reply_busy`).
 *   7. SEND         One PUT, never retried here. Success → `published` and the review row mirrors it.
 *                   Failure → `failed` with a code; the text stays, ready to retry.
 *
 * NOTHING HERE WRITES REPLY TEXT, REVIEW TEXT, A REVIEWER OR A TOKEN INTO A LOG OR AN ERROR. Results
 * carry codes; the reply body travels only to Google and the replies table.
 * NOTHING HERE GENERATES REPLY TEXT: every character was typed by a person.
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ReplyFailureCode =
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "confirmation_required"
  | "replies_disabled"
  | "not_configured"
  | "not_connected"
  | "authorization_expired"
  | "reply_changed"
  | "reply_empty"
  | "reply_too_long"
  | "review_unavailable"
  | "reply_unchanged"
  | "reply_busy"
  | "reply_conflict"
  | "reply_missing"
  | "reply_closed"
  | "reply_not_publishing"
  | "store_error"
  | "published_not_recorded"
  // Google, from the closed list in `client.ts`
  | "api_access_pending"
  | "api_disabled"
  | "permission_denied"
  | "quota_exceeded"
  | "rate_limited"
  | "server_error"
  | "network_error"
  | "bad_response"
  | "unexpected";

export type ReplyResult =
  | { ok: true; reply: ReplyRecord | null; alreadyOnGoogle?: boolean }
  | { ok: false; code: ReplyFailureCode; field?: "confirmPublish" | "confirmReplace"; reply?: ReplyRecord | null };

export function replyHttpStatus(code: ReplyFailureCode): number {
  switch (code) {
    case "forbidden": return 403;
    case "not_found": case "reply_missing": return 404;
    case "invalid_request": case "reply_empty": case "reply_too_long": case "confirmation_required": return 400;
    case "reply_busy": case "reply_conflict": case "reply_closed": case "reply_not_publishing": case "reply_changed": case "reply_unchanged": case "review_unavailable": return 409;
    case "replies_disabled": case "not_configured": case "not_connected": case "authorization_expired": case "api_access_pending": case "api_disabled": return 503;
    case "rate_limited": case "quota_exceeded": return 429;
    case "permission_denied": return 403;
    case "network_error": case "server_error": case "bad_response": case "published_not_recorded": return 502;
    default: return 500;
  }
}

export interface ReplyDependencies {
  config?: GoogleReviewsConfig;
  oauth?: OAuthSettings | null;
  replies?: ReplyStore;
  connections?: Pick<GoogleReviewsStore, "getActiveConnection" | "touchConnection">;
  fetchImpl?: FetchLike;
  now?: () => number;
  encryptionKey?: Buffer;
}

const fail = (code: ReplyFailureCode, extra: { field?: "confirmPublish" | "confirmReplace"; reply?: ReplyRecord | null } = {}): ReplyResult => ({ ok: false, code, ...extra });

function storeFailure(error: unknown): ReplyResult {
  return fail(error instanceof ReplyStoreError ? error.code : "store_error");
}

/** The review's context, or the failure to return. Checks the salon permission. */
type Authorized = { context: ReviewReplyContext; failure?: undefined } | { failure: ReplyResult; context?: undefined };

async function authorizedContext(actor: ReplyActor, reviewId: string, replies: ReplyStore): Promise<Authorized> {
  if (!isUuid(reviewId)) return { failure: fail("not_found") };
  let context;
  try {
    context = await replies.getContext(reviewId);
  } catch (error) {
    return { failure: storeFailure(error) };
  }
  if (!context) return { failure: fail("not_found") };
  if (!canReplyForStore(actor, context.storeCode)) return { failure: fail("forbidden") };
  return { context };
}

/* ------------------------------------------------------------------ drafts -- */

/** Create or edit the draft. Needs no Google access and no switch: nothing leaves Ask Bubbles. */
export async function saveReplyDraft(input: { actor: ReplyActor; reviewId: string; body: unknown; expectedVersion?: unknown }, deps: ReplyDependencies = {}): Promise<ReplyResult> {
  const replies = deps.replies ?? createSupabaseReplyStore();
  if (typeof input.body !== "string") return fail("invalid_request");
  const expected = input.expectedVersion === undefined || input.expectedVersion === null ? null : input.expectedVersion;
  if (expected !== null && !(typeof expected === "number" && Number.isInteger(expected) && expected >= 1)) return fail("invalid_request");

  const auth = await authorizedContext(input.actor, input.reviewId, replies);
  if (auth.failure) return auth.failure;
  try {
    return { ok: true, reply: await replies.saveDraft(input.reviewId, input.body, input.actor.label, expected as number | null) };
  } catch (error) {
    return storeFailure(error);
  }
}

export async function discardReplyDraft(input: { actor: ReplyActor; reviewId: string }, deps: ReplyDependencies = {}): Promise<ReplyResult> {
  const replies = deps.replies ?? createSupabaseReplyStore();
  const auth = await authorizedContext(input.actor, input.reviewId, replies);
  if (auth.failure) return auth.failure;
  const open = auth.context.openReply;
  if (!open) return fail("reply_missing");
  try {
    return { ok: true, reply: await replies.discard(open.id, input.actor.label) };
  } catch (error) {
    return storeFailure(error);
  }
}

/* ----------------------------------------------------------------- publish -- */

function googleCode(error: unknown): ReplyFailureCode {
  if (error instanceof GoogleApiError) {
    switch (error.code) {
      case "unauthorized": return "authorization_expired";
      case "not_found": return "review_unavailable";
      case "api_access_pending": case "api_disabled": case "permission_denied": case "quota_exceeded": case "rate_limited": case "server_error": case "network_error": case "bad_response":
        return error.code;
      default: return "unexpected";
    }
  }
  if (error instanceof OAuthError) return error.code === "invalid_grant" || error.code === "invalid_client" ? "authorization_expired" : "unexpected";
  return "unexpected";
}

export async function publishReply(
  input: { actor: ReplyActor; reviewId: string; version: unknown; confirmPublish: unknown; confirmReplace?: unknown },
  deps: ReplyDependencies = {},
): Promise<ReplyResult> {
  // 1. SWITCHES (before any database or Google access)
  const config = deps.config ?? readGoogleReviewsConfig();
  if (!config.enabled || !config.repliesEnabled) return fail("replies_disabled");
  const oauth = deps.oauth === undefined ? readOAuthSettings() : deps.oauth;
  if (!config.credentialsReady || !oauth) return fail("not_configured");

  if (!(typeof input.version === "number" && Number.isInteger(input.version) && input.version >= 1)) return fail("invalid_request");
  const replies = deps.replies ?? createSupabaseReplyStore();

  // 2. WHO
  const auth = await authorizedContext(input.actor, input.reviewId, replies);
  if (auth.failure) return auth.failure;
  const { context } = auth;
  let open = context.openReply;
  if (!open) return fail("reply_missing");
  if (context.removedAt) return fail("review_unavailable");

  // 3. CONFIRMATION — each exactly the boolean true; anything else is a refusal, never a publish.
  if (input.confirmPublish !== true) return fail("confirmation_required", { field: "confirmPublish" });
  if (open.baseReplyComment !== null && input.confirmReplace !== true) return fail("confirmation_required", { field: "confirmReplace" });
  if (open.version !== input.version) return fail("reply_conflict", { reply: open });

  const actor = input.actor.label;
  try {
    // 4. UNKNOWN OUTCOME from an earlier attempt
    if (open.status === "publishing") {
      const released = await replies.releaseStuck(open.id, actor);
      if (!released) return fail("reply_busy", { reply: open });
      open = { ...open, status: "failed", lastErrorCode: "outcome_unknown" };
    }
    if (open.status !== "draft" && open.status !== "failed") return fail("reply_closed", { reply: open });

    // The connection and an access token
    const connection = await (deps.connections ?? createSupabaseGoogleStore()).getActiveConnection();
    if (!connection) return fail("not_connected", { reply: open });
    let refreshToken: string;
    try {
      refreshToken = open_(connection.refreshTokenSealed, deps.encryptionKey);
    } catch (error) {
      return fail(error instanceof SealError ? "not_configured" : "unexpected", { reply: open });
    }
    const now = deps.now ?? Date.now;
    let accessToken: AccessToken | null = null;
    const client = new GoogleReplyClient({
      getAccessToken: async () => {
        if (!accessToken || now() >= accessToken.expiresAt) accessToken = await refreshAccessToken(oauth, refreshToken, deps.fetchImpl, now);
        return accessToken.value;
      },
      forceRefresh: () => { accessToken = null; },
      fetchImpl: deps.fetchImpl,
    });

    // 5. PRE-FLIGHT: what does Google hold right now?
    let current;
    try {
      current = await client.getReview(context.resourceName);
    } catch (error) {
      return fail(googleCode(error), { reply: open });
    }
    if (current.comment !== null && current.comment.trim() === open.body.trim()) {
      const done = await replies.markPublished(open.id, current.comment, current.updateTime, actor, true);
      return { ok: true, reply: done, alreadyOnGoogle: true };
    }
    if ((current.comment?.trim() ?? null) !== (open.baseReplyComment?.trim() ?? null)) return fail("reply_changed", { reply: open });

    // 6. CLAIM, once
    let claimed: ReplyRecord;
    try {
      claimed = await replies.claimPublish(open.id, input.version, actor);
    } catch (error) {
      return storeFailure(error);
    }

    // 7. SEND, once
    let sent;
    try {
      sent = await client.putReply(context.resourceName, claimed.body);
    } catch (error) {
      const code = googleCode(error);
      const failed = await replies.markFailed(claimed.id, code, actor).catch(() => claimed);
      return fail(code, { reply: failed });
    }
    try {
      return { ok: true, reply: await replies.markPublished(claimed.id, sent.comment, sent.updateTime, actor, false) };
    } catch {
      // Google has it; we could not write that down. Left `publishing` on purpose: the next publish releases it
      // as outcome_unknown, finds the same text on Google in its pre-flight, and records it without sending.
      return fail("published_not_recorded", { reply: claimed });
    }
  } catch (error) {
    return storeFailure(error);
  }
}

function open_(sealed: string, key?: Buffer): string {
  return openSealed(sealed, REFRESH_TOKEN_LABEL, key ?? readEncryptionKey());
}
