import { refusalCode, type RpcResult } from "./terminate";

/**
 * ============================================================================
 * REHIRE — an administrator's explicit, logged approval to restore access
 * ============================================================================
 *
 * Enforcement NEVER restores access. When Woven shows a revoked employee
 * Active again, the planner only flags `FLAG_REHIRE_REVIEW`; nothing re-enables
 * the account until an ACTIVE ADMINISTRATOR approves it here, with a written
 * reason. No enforcement, cron or shadow path imports this module
 * (`phase-one-guarantees.test.ts` enforces it).
 *
 * TWO PHASES, BOTH RETRYABLE, NEVER SUCCESS UNLESS BOTH COMPLETE
 *   1. `employee_access_approve_rehire` (database, under row locks): the
 *      approver is an active admin/owner/developer and not the account itself;
 *      a non-empty reason; the pinned company on the directory row and the
 *      latest sync; a confirmed link whose account enforcement revoked; Woven's
 *      latest successful read shows the employee Active (no past-termination
 *      conflict). Then it enables the profile and audits `status_changed` and
 *      `woven_rehire_approved` (approver + reason).
 *   2. the Auth ban is lifted (`restoreAuthAccess`), then
 *      `employee_access_record_rehire(ok)` clears `access_revoked_at` and
 *      audits `access_restored`. If the ban cannot be lifted the profile is put
 *      BACK to disabled (`record_rehire(not ok)`), so the two layers agree and a
 *      retry starts clean; if the process dies between phases a retry resumes.
 *
 * Idempotent: a second approval of a completed rehire is `already_rehired`.
 * Pure orchestration; the approver id is the verified session's, from the route.
 */

export interface RehireInput {
  appUserId: string;
  externalEmployeeId: string;
  reason: string;
}

export class RehireInputError extends Error {
  constructor(
    readonly code: "invalid_input",
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "RehireInputError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPLOYEE_ID = /^[A-Za-z0-9._:-]{1,64}$/;

export function parseRehire(body: Record<string, unknown> | null): RehireInput {
  const b = body ?? {};
  if (typeof b.appUserId !== "string" || !UUID.test(b.appUserId)) throw new RehireInputError("invalid_input", "appUserId must be an account id.");
  if (typeof b.externalEmployeeId !== "string" || !EMPLOYEE_ID.test(b.externalEmployeeId)) {
    throw new RehireInputError("invalid_input", "externalEmployeeId must be a Woven EmployeeID.");
  }
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (reason.length < 1 || reason.length > 300) throw new RehireInputError("invalid_input", "A written reason (1-300 characters) is required.");
  return { appUserId: b.appUserId.toLowerCase(), externalEmployeeId: b.externalEmployeeId, reason };
}

export interface RehireDeps {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  restoreAuth(userId: string): Promise<{ ok: boolean }>;
  pinnedCompanyId: string;
}

export type RehireOutcome =
  | { status: "rehired" }
  | { status: "already_rehired" }
  | { status: "refused"; code: string }
  /** Something did not complete: the account is NOT usable; approve again to retry. */
  | { status: "incomplete"; code: string };

export async function approveRehire(input: RehireInput, approverUserId: string, deps: RehireDeps): Promise<RehireOutcome> {
  try {
    const approved = await deps.rpc("employee_access_approve_rehire", {
      p_app_user_id: input.appUserId,
      p_external_employee_id: input.externalEmployeeId,
      p_woven_company_id: deps.pinnedCompanyId,
      p_approver: approverUserId,
      p_reason: input.reason,
    });
    if (approved.error) return { status: "refused", code: refusalCode(approved.error, "rehire_refused") };
    if (approved.data === "already_rehired") return { status: "already_rehired" };

    const restored = await deps.restoreAuth(input.appUserId);
    const recorded = await deps.rpc("employee_access_record_rehire", {
      p_app_user_id: input.appUserId,
      p_approver: approverUserId,
      p_ok: restored.ok,
      p_detail: restored.ok ? "auth_ban_lifted" : "unban",
    });
    if (!restored.ok) return { status: "incomplete", code: recorded.error ? "unban_failed_not_reverted" : "unban_failed_reverted" };
    if (recorded.error) return { status: "incomplete", code: "rehire_not_recorded" };
    return { status: "rehired" };
  } catch {
    return { status: "incomplete", code: "rehire_interrupted" };
  }
}
