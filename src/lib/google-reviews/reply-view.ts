/**
 * What the Reviews dashboard needs to draw the reply controls. Plain data, safe to send to the browser:
 * no ids of people, no tokens, no Google resource names. Computed on the server from the VERIFIED session.
 */

export type ReplyViewStatus = "draft" | "publishing" | "failed";

export interface ReplyView {
  id: string;
  kind: "new" | "edit";
  status: ReplyViewStatus;
  body: string;
  /** Revision of the text; the publish confirms exactly this version. */
  version: number;
  lastErrorCode: string | null;
  /** True when the reply on file is no longer the one this draft was started from. Publishing is then blocked. */
  stale: boolean;
}

export interface ReplyAccess {
  /** False when the person may not reply anywhere, or the reply tables cannot be read: no controls are drawn. */
  available: boolean;
  /** Whether Publish may be used now (switches on, Google configured). Drafting works regardless. */
  publishingEnabled: boolean;
  /** Store codes this person may answer. */
  stores: string[];
}

export interface ReplyState {
  access: ReplyAccess;
  /** Open reply (draft / publishing / failed) by review id. */
  byReview: Record<string, ReplyView>;
}

export const NO_REPLY_STATE: ReplyState = { access: { available: false, publishingEnabled: false, stores: [] }, byReview: {} };

/** One sentence per code, safe to show to staff. Never includes Google's wording or any text of the review. */
export const REPLY_REASONS: Readonly<Record<string, string>> = {
  forbidden: "You can only reply to reviews for the salons in your assignment.",
  not_found: "That review was not found.",
  invalid_request: "The request was not understood.",
  confirmation_required: "Publishing needs an explicit confirmation.",
  replies_disabled: "Publishing replies to Google is not switched on yet. Your draft is saved.",
  not_configured: "Google is not fully configured, so nothing was sent. Your draft is saved.",
  not_connected: "Ask Bubbles is not connected to Google, so nothing was sent. Your draft is saved.",
  authorization_expired: "The Google connection has expired. An administrator needs to reconnect it. Your draft is saved.",
  reply_changed: "The reply on Google changed since this draft was started. Nothing was sent. Discard this draft and start again from the current reply.",
  reply_empty: "A reply cannot be empty.",
  reply_too_long: "A reply can be at most 4,096 bytes.",
  review_unavailable: "Google no longer returns this review, so it cannot be answered.",
  reply_unchanged: "That is already the reply on this review.",
  reply_busy: "A publish for this review is already in progress.",
  reply_conflict: "This draft was changed after you opened it. Review the text and confirm again.",
  reply_missing: "There is no draft to act on.",
  reply_closed: "That reply is already finished.",
  reply_not_publishing: "That reply is not being published.",
  store_error: "The reply could not be saved. Try again.",
  published_not_recorded: "Google accepted the reply but it could not be recorded here. Publish again to reconcile; nothing will be sent twice.",
  api_access_pending: "Google has not yet approved access for replies.",
  api_disabled: "A required Google API is not enabled for the project.",
  permission_denied: "Google refused the request for this account or salon.",
  quota_exceeded: "Google's daily limit was reached. Try again later.",
  rate_limited: "Google asked us to slow down. Try again in a minute.",
  server_error: "Google had a problem. The reply may or may not have been posted; publishing again will check first.",
  network_error: "The connection to Google dropped. The reply may or may not have been posted; publishing again will check first.",
  bad_response: "Google's answer could not be read. Publishing again will check what Google holds first.",
  unexpected: "Something unexpected went wrong. Try again.",
  outcome_unknown: "The last attempt did not finish. Publishing again will check what Google holds first, so nothing is sent twice.",
};


/** The sentence to show for a failure/error code; unknown codes get a generic one, never the raw code. */
export function replyReason(code: string | null | undefined): string {
  return (code && REPLY_REASONS[code]) || REPLY_REASONS.unexpected!;
}
