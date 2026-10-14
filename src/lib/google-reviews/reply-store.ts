import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * THE REPLY STORE — every database call the reply feature makes. Server-side secret key only; every
 * write is a SECURITY DEFINER function that re-checks the row state it depends on (see the migration).
 * Database errors are mapped to a closed code and dropped: a Postgres message can quote reply text.
 */

export type ReplyStatus = "draft" | "publishing" | "published" | "failed" | "discarded";

export interface ReplyRecord {
  id: string;
  reviewId: string;
  kind: "new" | "edit";
  status: ReplyStatus;
  body: string;
  /** The owner reply on file when the draft was started; null for a first reply. */
  baseReplyComment: string | null;
  /** Revision of the text. A publish confirms exactly one version. */
  version: number;
  attempts: number;
  updatedBy: string;
  updatedAt: string;
  publishedBy: string | null;
  publishedAt: string | null;
  lastErrorCode: string | null;
}

export interface ReviewReplyContext {
  reviewId: string;
  locationId: string;
  storeCode: string;
  resourceName: string;
  /** The owner reply on file now (mirrors Google as of the last sync/publish). */
  replyComment: string | null;
  removedAt: string | null;
  openReply: ReplyRecord | null;
}

export type ReplyStoreErrorCode =
  | "reply_empty"
  | "reply_too_long"
  | "review_unavailable"
  | "reply_unchanged"
  | "reply_busy"
  | "reply_conflict"
  | "reply_missing"
  | "reply_closed"
  | "reply_not_publishing"
  | "store_error";

const KNOWN: readonly ReplyStoreErrorCode[] = [
  "reply_empty", "reply_too_long", "review_unavailable", "reply_unchanged", "reply_busy",
  "reply_conflict", "reply_missing", "reply_closed", "reply_not_publishing",
];

export class ReplyStoreError extends Error {
  readonly code: ReplyStoreErrorCode;
  constructor(code: ReplyStoreErrorCode) {
    super(`Google review replies store: ${code}`);
    this.name = "ReplyStoreError";
    this.code = code;
  }
}

function fail(error: { message?: string } | null): never {
  const message = error?.message ?? "";
  const hit = KNOWN.find((code) => message.includes(code));
  throw new ReplyStoreError(hit ?? "store_error");
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function toReplyRecord(raw: unknown): ReplyRecord {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    reviewId: String(r.review_id),
    kind: r.kind === "edit" ? "edit" : "new",
    status: r.status as ReplyStatus,
    body: String(r.body ?? ""),
    baseReplyComment: str(r.base_reply_comment),
    version: Number(r.version ?? 1),
    attempts: Number(r.attempts ?? 0),
    updatedBy: String(r.updated_by ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    publishedBy: str(r.published_by),
    publishedAt: str(r.published_at),
    lastErrorCode: str(r.last_error_code),
  };
}

export interface ReplyStore {
  getContext(reviewId: string): Promise<ReviewReplyContext | null>;
  openRepliesFor(reviewIds: readonly string[]): Promise<ReplyRecord[]>;
  saveDraft(reviewId: string, body: string, actor: string, expectedVersion: number | null): Promise<ReplyRecord>;
  claimPublish(replyId: string, version: number, actor: string): Promise<ReplyRecord>;
  releaseStuck(replyId: string, actor: string): Promise<boolean>;
  markPublished(replyId: string, comment: string, updateTime: string | null, actor: string, reconciled: boolean): Promise<ReplyRecord>;
  markFailed(replyId: string, code: string, actor: string): Promise<ReplyRecord>;
  discard(replyId: string, actor: string): Promise<ReplyRecord>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

export function createSupabaseReplyStore(client: SupabaseClient = getSupabaseAdmin()): ReplyStore {
  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await client.rpc(fn, args);
    if (error) fail(error);
    return data as T;
  };
  return {
    async getContext(reviewId) {
      const data = await rpc<Record<string, unknown> | null>("google_review_reply_context", { p_review: reviewId });
      if (!data) return null;
      return {
        reviewId: String(data.review_id),
        locationId: String(data.location_id),
        storeCode: String(data.store_code),
        resourceName: String(data.resource_name),
        replyComment: str(data.reply_comment),
        removedAt: str(data.removed_at),
        openReply: data.open_reply ? toReplyRecord(data.open_reply) : null,
      };
    },
    async openRepliesFor(reviewIds) {
      if (reviewIds.length === 0) return [];
      const data = await rpc<unknown[]>("google_review_replies_open", { p_review_ids: [...reviewIds] });
      return (data ?? []).map(toReplyRecord);
    },
    async saveDraft(reviewId, body, actor, expectedVersion) {
      return toReplyRecord(await rpc("google_review_reply_save_draft", { p_review: reviewId, p_body: body, p_actor: actor, p_expected_version: expectedVersion }));
    },
    async claimPublish(replyId, version, actor) {
      return toReplyRecord(await rpc("google_review_reply_claim_publish", { p_reply: replyId, p_version: version, p_actor: actor }));
    },
    async releaseStuck(replyId, actor) {
      return (await rpc<boolean>("google_review_reply_release_stuck", { p_reply: replyId, p_actor: actor })) === true;
    },
    async markPublished(replyId, comment, updateTime, actor, reconciled) {
      return toReplyRecord(await rpc("google_review_reply_mark_published", { p_reply: replyId, p_comment: comment, p_update_time: updateTime, p_actor: actor, p_reconciled: reconciled }));
    },
    async markFailed(replyId, code, actor) {
      return toReplyRecord(await rpc("google_review_reply_mark_failed", { p_reply: replyId, p_code: code, p_actor: actor }));
    },
    async discard(replyId, actor) {
      return toReplyRecord(await rpc("google_review_reply_discard", { p_reply: replyId, p_actor: actor }));
    },
  };
}
