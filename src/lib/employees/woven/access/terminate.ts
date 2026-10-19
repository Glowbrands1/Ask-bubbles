import { ADMIN_CONSOLE_ROLES } from "@/lib/permissions";
import type { Role } from "@/types";

import type { AccessPlan } from "./build";
import type { TerminationEnforcementConfig } from "./termination-config";
import type { PlannedRow } from "./types";

/**
 * ============================================================================
 * TERMINATION ENFORCEMENT — disable + revoke, ONLY for a confirmed, in-scope,
 * unprotected account whose Woven status is Terminated
 * ============================================================================
 *
 * The one apply path in the Woven access code. It runs only when
 * `WOVEN_TERMINATION_ENFORCEMENT=on` (`termination-config.ts`, default off,
 * fails closed) and after a successful scheduled directory sync. It applies
 * `DISABLE_TERMINATED` and NOTHING ELSE: it never creates, invites, links,
 * re-roles, re-scopes, moves or RE-ENABLES anybody.
 *
 * EVERY CONDITION, in order. A row that fails one is recorded `skipped` with
 * the code shown and nothing is changed:
 *
 *   switch_off              the switch is not exactly "on" (nothing runs at all)
 *   guard_blocked           a mass-change guard tripped (stale/failed sync, a
 *                           wave of terminations over the threshold, ...)
 *   not_confirmed_link      the account is not reached through a confirmed
 *                           EmployeeID link (never name or email alone)
 *   protected_account       a role override, or an administrative role
 *                           (admin, owner, developer) — which also means the
 *                           last active administrator can never be touched
 *   acting_account          the account of the person who triggered the run
 *   not_in_approved_batch   an allowlist is set and the employee is not on it
 *   ...then the DATABASE re-checks everything under row locks
 *   (`employee_access_disable_terminated`): the link and its method, the
 *   managed_status flag, protection, the latest directory sync succeeded, the
 *   company on the directory row AND the latest sync run is the pinned
 *   Midwest Soap Makers id, and Woven's Terminated status in the latest read.
 *   A refusal is recorded `failed` with its short code; nothing changed.
 *
 * ORDER, per account: profile disabled (DB, re-checked) → auth ban + every
 * session and refresh token revoked (`revokeAuthAccess`) → record stamped.
 * A partial failure leaves the account disabled but its link WITHOUT
 * `access_revoked_at`, so the planner proposes DISABLE_TERMINATED again next
 * run and every step is idempotent. Already-revoked accounts yield no action.
 *
 * Pure orchestration: every effect is in `TerminationDeps`.
 */

export const TERMINATION_ACTOR_PREFIX = "woven-termination";

export interface RpcResult {
  data: unknown;
  error: { message?: string; code?: string } | null;
}

export interface TerminationDeps {
  loadPlan(now: Date): Promise<AccessPlan>;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  revokeAuth(userId: string): Promise<{ ok: boolean; failed: string[] }>;
  /** The pinned Woven company id, handed to the database to re-prove. */
  pinnedCompanyId: string;
}

export interface TerminationRequest {
  requestedBy: string;
  /** The Ask Bubbles account that triggered this run, if a person did. The scheduled run has none. */
  actingUserId?: string | null;
  config: TerminationEnforcementConfig;
  now?: Date;
}

export interface TerminationTally {
  applied: number;
  failed: number;
  skipped: number;
}

export type TerminationOutcome =
  | { status: "off" }
  | { status: "aborted"; guardCodes: string[]; accessRunId: string | null }
  | { status: "completed"; tally: TerminationTally; accessRunId: string | null }
  | { status: "failed"; code: string };

interface RecordedAction {
  external_employee_id: string | null;
  app_user_id: string | null;
  action: string;
  is_primary: boolean;
  reason_codes: string[];
  before_values: PlannedRow["before"];
  after_values: PlannedRow["after"];
  woven_source_at: string | null;
  result: "applied" | "failed" | "skipped";
  result_code: string;
}

const SAFE_CODE = /^[a-z0-9_.:-]{1,80}$/;
/** The database functions raise their own short codes; anything else is not passed on. */
export function refusalCode(error: { message?: string; code?: string } | null | undefined, fallback: string): string {
  const message = (error?.message ?? "").trim();
  return SAFE_CODE.test(message) ? message : fallback;
}

const isAdministrative = (role: Role) => (ADMIN_CONSOLE_ROLES as readonly string[]).includes(role);

/** The TypeScript-side conditions. Returns a skip code, or null when the row may go on to the database re-check. */
export function skipReason(row: PlannedRow, request: TerminationRequest): string | null {
  const account = row.account;
  if (!account || account.via !== "link" || !row.externalEmployeeId || row.wovenStatus !== "terminated") return "not_confirmed_link";
  if (account.management !== "woven_linked") return "not_confirmed_link";
  if (account.isProtected || isAdministrative(account.role)) return "protected_account";
  if (request.actingUserId && account.appUserId === request.actingUserId) return "acting_account";
  const list = request.config.employeeAllowlist;
  if (list !== null && !list.includes(row.externalEmployeeId)) return "not_in_approved_batch";
  return null;
}

function record(row: PlannedRow, result: RecordedAction["result"], code: string): RecordedAction[] {
  return row.actions
    .filter((action) => action === "DISABLE_TERMINATED")
    .map(() => ({
      external_employee_id: row.externalEmployeeId,
      app_user_id: row.appUserId,
      action: "DISABLE_TERMINATED",
      is_primary: true,
      reason_codes: row.reasons,
      before_values: row.before,
      after_values: row.after,
      woven_source_at: row.wovenSourceAt,
      result,
      result_code: code.slice(0, 80),
    }));
}

export async function enforceTerminations(request: TerminationRequest, deps: TerminationDeps): Promise<TerminationOutcome> {
  if (!request.config.enabled) return { status: "off" };
  const now = request.now ?? new Date();
  const setBy = `${TERMINATION_ACTOR_PREFIX}:${request.requestedBy}`.slice(0, 120);

  let plan: AccessPlan;
  try {
    plan = await deps.loadPlan(now);
  } catch {
    return { status: "failed", code: "plan_failed" };
  }

  const candidates = [...plan.rows].filter((r) => r.actions[0] === "DISABLE_TERMINATED").sort((a, b) => a.key.localeCompare(b.key));
  const recorded: RecordedAction[] = [];
  const tally: TerminationTally = { applied: 0, failed: 0, skipped: 0 };

  const finish = async (status: "completed" | "aborted", guardCodes: string[]): Promise<string | null> => {
    if (recorded.length === 0) return null;
    const { data, error } = await deps.rpc("employee_access_record_apply_run", {
      p_requested_by: request.requestedBy,
      p_directory_run_id: plan.directoryRunId,
      p_policy_version: plan.policyVersion,
      p_guard_codes: status === "aborted" ? guardCodes : [],
      p_counts: { actions: plan.counts, guard: plan.guard.details, mappings: plan.mappings, tally },
      p_actions: recorded,
    });
    return error || typeof data !== "string" ? null : data;
  };

  /* The mass-change guards: one tripped guard and NOTHING is applied. */
  if (!plan.guard.mutationsAllowed) {
    for (const row of candidates) {
      tally.skipped += 1;
      recorded.push(...record(row, "skipped", "guard_blocked"));
    }
    return { status: "aborted", guardCodes: plan.guard.codes, accessRunId: await finish("aborted", plan.guard.codes) };
  }

  for (const row of candidates) {
    const skip = skipReason(row, request);
    if (skip) {
      tally.skipped += 1;
      recorded.push(...record(row, "skipped", skip));
      continue;
    }
    const outcome = await disableOne(row, deps, setBy);
    if (outcome.ok) tally.applied += 1;
    else tally.failed += 1;
    recorded.push(...record(row, outcome.ok ? "applied" : "failed", outcome.code));
  }

  return { status: "completed", tally, accessRunId: await finish("completed", []) };
}

async function disableOne(row: PlannedRow, deps: TerminationDeps, setBy: string): Promise<{ ok: boolean; code: string }> {
  const appUserId = row.account?.appUserId;
  if (!appUserId || !row.externalEmployeeId) return { ok: false, code: "disable_input_incomplete" };

  try {
    const disabled = await deps.rpc("employee_access_disable_terminated", {
      p_app_user_id: appUserId,
      p_external_employee_id: row.externalEmployeeId,
      p_woven_company_id: deps.pinnedCompanyId,
      p_set_by: setBy,
    });
    if (disabled.error) return { ok: false, code: refusalCode(disabled.error, "disable_refused") };

    const revoked = await deps.revokeAuth(appUserId);
    const stamped = await deps.rpc("employee_access_record_revocation", {
      p_app_user_id: appUserId,
      p_ok: revoked.ok,
      p_detail: revoked.ok ? "auth_ban,sessions_revoked" : `failed:${revoked.failed.join(",")}`,
      p_set_by: setBy,
    });
    if (!revoked.ok) return { ok: false, code: `auth_revocation_incomplete.${revoked.failed.join("_")}` };
    if (stamped.error) return { ok: false, code: "revocation_not_recorded" };
    return { ok: true, code: `${String(disabled.data)}.auth_revoked` };
  } catch {
    return { ok: false, code: "disable_interrupted" };
  }
}
