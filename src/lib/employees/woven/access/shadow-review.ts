import { createHash } from "node:crypto";

import { refusalCode, type RpcResult } from "./terminate";

/**
 * ============================================================================
 * THE ADMINISTRATOR'S SHADOW-RUN REVIEW — the human gate before enforcement
 * ============================================================================
 *
 * Termination enforcement acts only on EmployeeIDs an administrator approved
 * on the NEWEST clean, fresh shadow run (`employee_access_review_state`).
 * This is the write side: the administrator names the run, the exact list of
 * EmployeeIDs and a reason; the server adds the hash of that list; the
 * database re-checks that the reviewer is an ACTIVE administrator, that the run
 * is the newest, clean and fresh, that every id is a DISABLE_TERMINATED that
 * run planned, and the pinned Midwest Soap Makers company on each directory row.
 *
 * Pure: the reviewer id comes from the verified session (the route), never
 * from the body.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPLOYEE_ID = /^[A-Za-z0-9._:-]{1,64}$/;
export const MAX_REVIEW_IDS = 200;

export class ShadowReviewError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ShadowReviewError";
  }
}

/** sha256 (hex) of the sorted, de-duplicated EmployeeIDs joined by newlines — the same as `employee_access_ids_hash`. */
export function employeeIdsHash(ids: readonly string[]): string {
  const sorted = [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash("sha256").update(sorted.join("\n"), "utf8").digest("hex");
}

export interface ShadowReviewInput {
  shadowRunId: string;
  employeeIds: string[];
  reason: string;
}

export function parseShadowReview(body: Record<string, unknown> | null): ShadowReviewInput {
  const b = body ?? {};
  if (typeof b.shadowRunId !== "string" || !UUID.test(b.shadowRunId)) {
    throw new ShadowReviewError("invalid_input", "shadowRunId must be the shadow run's id.", 400);
  }
  if (!Array.isArray(b.employeeIds) || b.employeeIds.length === 0 || b.employeeIds.length > MAX_REVIEW_IDS) {
    throw new ShadowReviewError("invalid_input", `employeeIds must list between 1 and ${MAX_REVIEW_IDS} Woven EmployeeIDs.`, 400);
  }
  const ids = b.employeeIds.map((v) => (typeof v === "string" ? v.trim() : ""));
  if (ids.some((id) => !EMPLOYEE_ID.test(id))) {
    throw new ShadowReviewError("invalid_input", "employeeIds must be Woven EmployeeIDs.", 400);
  }
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (reason.length < 1 || reason.length > 300) {
    throw new ShadowReviewError("invalid_input", "A written reason (1-300 characters) is required.", 400);
  }
  return { shadowRunId: b.shadowRunId.toLowerCase(), employeeIds: [...new Set(ids)].sort(), reason };
}

export interface ShadowReviewDeps {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  pinnedCompanyId: string;
}

export type ShadowReviewOutcome =
  | { status: "recorded"; reviewId: string; employeeCount: number; idsSha256: string }
  | { status: "refused"; code: string };

export async function recordShadowReview(input: ShadowReviewInput, reviewerUserId: string, deps: ShadowReviewDeps): Promise<ShadowReviewOutcome> {
  try {
    const { data, error } = await deps.rpc("employee_access_record_shadow_review", {
      p_shadow_run_id: input.shadowRunId,
      p_reviewer: reviewerUserId,
      p_employee_ids: input.employeeIds,
      p_ids_sha256: employeeIdsHash(input.employeeIds),
      p_woven_company_id: deps.pinnedCompanyId,
      p_reason: input.reason,
    });
    if (error) return { status: "refused", code: refusalCode(error, "review_refused") };
    if (typeof data !== "string") return { status: "refused", code: "review_not_recorded" };
    return { status: "recorded", reviewId: data, employeeCount: input.employeeIds.length, idsSha256: employeeIdsHash(input.employeeIds) };
  } catch {
    return { status: "refused", code: "review_interrupted" };
  }
}
