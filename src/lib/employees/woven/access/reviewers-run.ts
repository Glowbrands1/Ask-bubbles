import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

import { classifyStatusError } from "../status";
import { designateReviewer, revokeReviewer, type ReviewerInput, type ReviewerOutcome } from "./reviewers";
import type { RpcResult } from "./terminate";

/** One designation, current or closed. Account ids, emails and the written reasons only. */
export interface DesignationRow {
  id: string;
  userId: string;
  designatedByEmail: string;
  designatedAt: string;
  reason: string;
  revokedAt: string | null;
  revokedByEmail: string | null;
  revokeReason: string | null;
}

const deps = () => ({ rpc: (fn: string, args: Record<string, unknown>) => getSupabaseAdmin().rpc(fn, args) as unknown as PromiseLike<RpcResult> });

export const runDesignateReviewer = (input: ReviewerInput, actorUserId: string): Promise<ReviewerOutcome> => designateReviewer(input, actorUserId, deps());
export const runRevokeReviewer = (input: ReviewerInput, actorUserId: string): Promise<ReviewerOutcome> => revokeReviewer(input, actorUserId, deps());

/** The whole history, newest first: who is designated now, and who was, by whom and why. */
export async function listDesignations(): Promise<DesignationRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("woven_enforcement_reviewers")
    .select("id, user_id, designated_by_email, designated_at, reason, revoked_at, revoked_by_email, revoke_reason")
    .order("designated_at", { ascending: false });
  if (error) throw classifyStatusError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    designatedByEmail: String(r.designated_by_email),
    designatedAt: String(r.designated_at),
    reason: String(r.reason),
    revokedAt: typeof r.revoked_at === "string" ? r.revoked_at : null,
    revokedByEmail: typeof r.revoked_by_email === "string" ? r.revoked_by_email : null,
    revokeReason: typeof r.revoke_reason === "string" ? r.revoke_reason : null,
  }));
}
