import { createHash } from "node:crypto";

import type { NormalizedReview } from "./types";

/**
 * ONE GOOGLE REVIEW → WHAT ASK BUBBLES KEEPS.
 *
 * The ONLY place a Google review's fields are read. It builds the result field
 * by field from a closed list; the response object is never spread, copied or
 * stored. Of the reviewer only the display name is kept (never the photo or
 * profile URL); anonymous reviewers keep none.
 *
 * A review is REJECTED (never half-saved) when:
 *   - its `name` is not exactly `{account}/{location}/reviews/{reviewId}` for the
 *     location it was requested from — a review cannot be attributed to a store
 *     Google did not serve it for;
 *   - the id, rating or either timestamp is missing or malformed.
 * A rejected review marks the whole location read INCOMPLETE (nothing is then
 * marked removed), because a response we could not fully read is not proof that
 * anything is gone.
 */

const RATING: Readonly<Record<string, 1 | 2 | 3 | 4 | 5>> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const MAX_TEXT = 5000;
const REVIEW_ID = /^[A-Za-z0-9_.:=+-]{1,200}$/;

export type RejectReason = "not_an_object" | "bad_id" | "resource_mismatch" | "bad_rating" | "bad_time";

export type NormalizeResult = { ok: true; review: NormalizedReview } | { ok: false; reason: RejectReason };

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, MAX_TEXT);
}

function instant(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function contentHash(parts: {
  starRating: number;
  comment: string | null;
  updateTime: string;
  replyComment: string | null;
  replyUpdateTime: string | null;
  reviewerName?: string | null;
}): string {
  return createHash("sha256")
    .update(JSON.stringify([parts.starRating, parts.comment, parts.updateTime, parts.replyComment, parts.replyUpdateTime, parts.reviewerName ?? null]))
    .digest("hex");
}

export function normalizeReview(raw: unknown, expected: { accountName: string; locationName: string }): NormalizeResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "not_an_object" };
  const r = raw as { reviewId?: unknown; name?: unknown; starRating?: unknown; comment?: unknown; createTime?: unknown; updateTime?: unknown; reviewReply?: unknown; reviewer?: unknown };

  const googleReviewId = typeof r.reviewId === "string" ? r.reviewId : "";
  if (!REVIEW_ID.test(googleReviewId)) return { ok: false, reason: "bad_id" };

  const resourceName = `${expected.accountName}/${expected.locationName}/reviews/${googleReviewId}`;
  if (r.name !== resourceName) return { ok: false, reason: "resource_mismatch" };

  const starRating = typeof r.starRating === "string" ? RATING[r.starRating] : undefined;
  if (!starRating) return { ok: false, reason: "bad_rating" };

  const createTime = instant(r.createTime);
  const updateTime = instant(r.updateTime) ?? createTime;
  if (!createTime || !updateTime) return { ok: false, reason: "bad_time" };

  const comment = text(r.comment);
  const reply = r.reviewReply && typeof r.reviewReply === "object" ? (r.reviewReply as { comment?: unknown; updateTime?: unknown }) : null;
  const replyComment = reply ? text(reply.comment) : null;
  const replyUpdateTime = replyComment && reply ? instant(reply.updateTime) : null;

  const reviewer = r.reviewer && typeof r.reviewer === "object" ? (r.reviewer as { displayName?: unknown; isAnonymous?: unknown }) : null;
  const reviewerName = reviewer && reviewer.isAnonymous !== true ? (text(reviewer.displayName)?.slice(0, 200) ?? null) : null;

  return {
    ok: true,
    review: {
      googleReviewId,
      resourceName,
      starRating,
      comment,
      createTime,
      updateTime,
      replyComment,
      replyUpdateTime,
      reviewerName,
      contentHash: contentHash({ starRating, comment, updateTime, replyComment, replyUpdateTime, reviewerName }),
    },
  };
}

export interface NormalizedBatch {
  reviews: NormalizedReview[];
  rejected: Record<RejectReason, number>;
  rejectedTotal: number;
  /** Review ids that appeared more than once in the same read (kept once). */
  duplicatesInRead: number;
}

export function normalizeReviews(raws: readonly unknown[], expected: { accountName: string; locationName: string }): NormalizedBatch {
  const reviews: NormalizedReview[] = [];
  const rejected: Record<RejectReason, number> = { not_an_object: 0, bad_id: 0, resource_mismatch: 0, bad_rating: 0, bad_time: 0 };
  const seen = new Set<string>();
  let duplicatesInRead = 0;
  for (const raw of raws) {
    const result = normalizeReview(raw, expected);
    if (!result.ok) {
      rejected[result.reason] += 1;
      continue;
    }
    if (seen.has(result.review.googleReviewId)) {
      duplicatesInRead += 1;
      continue;
    }
    seen.add(result.review.googleReviewId);
    reviews.push(result.review);
  }
  return { reviews, rejected, rejectedTotal: Object.values(rejected).reduce((a, b) => a + b, 0), duplicatesInRead };
}
