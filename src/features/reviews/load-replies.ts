import "server-only";

import { APPROVED_GOOGLE_STORES } from "@/config/company/google-reviews";
import { pageIdentity } from "@/lib/auth/page";
import { readGoogleReviewsConfig } from "@/lib/google-reviews/config";
import { canReplyForStore, mayReplyAnywhere, replyActorLabel, type ReplyActor } from "@/lib/google-reviews/reply-access";
import { createSupabaseReplyStore, type ReplyStore } from "@/lib/google-reviews/reply-store";
import { NO_REPLY_STATE, type ReplyState, type ReplyView } from "@/lib/google-reviews/reply-view";
import type { ReviewRow } from "@/lib/google-reviews/views";

/**
 * WHICH ROWS GET REPLY CONTROLS, AND THE OPEN REPLIES FOR THEM.
 *
 * Decided on the server from the verified session. Hiding a button is a courtesy; the routes and the
 * service re-check the same rule (`canReplyForStore`) on every call. If the reply tables cannot be read
 * (for example before the migration is applied) the dashboard simply draws no reply controls — it never
 * fails the page.
 */
export async function loadReplyState(rows: readonly ReviewRow[], deps: { actor?: ReplyActor | null; store?: ReplyStore } = {}): Promise<ReplyState> {
  try {
    let actor = deps.actor;
    if (actor === undefined) {
      const identity = await pageIdentity();
      actor = identity ? { label: replyActorLabel(identity), role: identity.role, scope: identity.scope, verified: identity.verified } : null;
    }
    if (!mayReplyAnywhere(actor)) return NO_REPLY_STATE;
    const stores = APPROVED_GOOGLE_STORES.map((s) => s.code).filter((code) => canReplyForStore(actor, code));
    if (stores.length === 0) return NO_REPLY_STATE;

    const config = readGoogleReviewsConfig();
    const mine = rows.filter((r) => stores.includes(r.storeCode));
    const open = await (deps.store ?? createSupabaseReplyStore()).openRepliesFor(mine.map((r) => r.id));
    const byReview: Record<string, ReplyView> = {};
    for (const reply of open) {
      if (reply.status !== "draft" && reply.status !== "publishing" && reply.status !== "failed") continue;
      const row = mine.find((r) => r.id === reply.reviewId);
      if (!row) continue;
      byReview[reply.reviewId] = {
        id: reply.id,
        kind: reply.kind,
        status: reply.status,
        body: reply.body,
        version: reply.version,
        lastErrorCode: reply.lastErrorCode,
        stale: (reply.baseReplyComment?.trim() ?? null) !== (row.replyComment?.trim() ?? null),
      };
    }
    return { access: { available: true, publishingEnabled: config.enabled && config.repliesEnabled && config.credentialsReady, stores }, byReview };
  } catch {
    return NO_REPLY_STATE;
  }
}
