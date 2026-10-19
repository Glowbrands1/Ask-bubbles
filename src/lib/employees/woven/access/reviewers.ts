import { refusalCode, type RpcResult } from "./terminate";

/**
 * ============================================================================
 * WHO MAY REVIEW TERMINATION ENFORCEMENT — a designated administrator, nobody assumed
 * ============================================================================
 *
 * Enforcement acts only on a shadow run a DESIGNATED reviewer approved. The list
 * of designated reviewers (`woven_enforcement_reviewers`) STARTS EMPTY and no
 * migration, seed or test fixture names a person: with nobody designated,
 * enforcement cannot act at all. WHO should be designated is a Buff City Soap
 * decision; this module only records it.
 *
 * Designating needs an ACTIVE administrator (admin / owner / developer) acting
 * for ANOTHER active administrator, with a written reason; revoking needs an
 * active administrator and a written reason; a revoked designation invalidates
 * every review made under it, for good. Both are audited by the database
 * (`woven_reviewer_designated`, `woven_reviewer_revoked`). The acting account is
 * the verified session's, never the request body (the route); the database
 * re-checks it.
 *
 * Pure: effects go through `ReviewerDeps`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ReviewerInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewerInputError";
  }
  readonly code = "invalid_input";
  readonly status = 400;
}

export interface ReviewerInput {
  userId: string;
  reason: string;
}

export function parseReviewerChange(body: Record<string, unknown> | null): ReviewerInput {
  const b = body ?? {};
  if (typeof b.userId !== "string" || !UUID.test(b.userId)) throw new ReviewerInputError("userId must be an account id.");
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (reason.length < 1 || reason.length > 300) throw new ReviewerInputError("A written reason (1-300 characters) is required.");
  return { userId: b.userId.toLowerCase(), reason };
}

export interface ReviewerDeps {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
}

export type ReviewerOutcome = { status: "designated" | "revoked"; designationId: string } | { status: "refused"; code: string };

async function change(fn: "employee_access_designate_reviewer" | "employee_access_revoke_reviewer", done: "designated" | "revoked", input: ReviewerInput, actorUserId: string, deps: ReviewerDeps): Promise<ReviewerOutcome> {
  try {
    const { data, error } = await deps.rpc(fn, { p_user_id: input.userId, p_actor: actorUserId, p_reason: input.reason });
    if (error) return { status: "refused", code: refusalCode(error, `${done === "designated" ? "designate" : "revoke"}_refused`) };
    if (typeof data !== "string") return { status: "refused", code: "not_recorded" };
    return { status: done, designationId: data };
  } catch {
    return { status: "refused", code: "interrupted" };
  }
}

export const designateReviewer = (input: ReviewerInput, actorUserId: string, deps: ReviewerDeps) =>
  change("employee_access_designate_reviewer", "designated", input, actorUserId, deps);

export const revokeReviewer = (input: ReviewerInput, actorUserId: string, deps: ReviewerDeps) =>
  change("employee_access_revoke_reviewer", "revoked", input, actorUserId, deps);
