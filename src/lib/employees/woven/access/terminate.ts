import { WOVEN_TERMINATION_PROTECTED_ROLES } from "@/config/company/woven";
import { APP_SWITCHER_USER_IDS } from "@/lib/auth/app-switcher-users";
import { ADMIN_CONSOLE_ROLES } from "@/lib/permissions";
import type { Role } from "@/types";

import type { AccessPlan } from "./build";
import type { TerminationEnforcementConfig } from "./termination-config";
import type { PlannedRow } from "./types";

/**
 * ============================================================================
 * TERMINATION ENFORCEMENT — disable + revoke, ONLY for a confirmed, in-scope,
 * unprotected account whose Woven status is Terminated AND whose EmployeeID an
 * administrator approved on a reviewed shadow run
 * ============================================================================
 *
 * The one apply path in the Woven access code. It runs only when
 * `WOVEN_TERMINATION_ENFORCEMENT=on` (`termination-config.ts`, default off,
 * fails closed) AND `WOVEN_ACCESS_MODE=shadow`, after a successful scheduled
 * directory sync. It applies `DISABLE_TERMINATED` and NOTHING ELSE: it never
 * creates, invites, links, re-roles, re-scopes or moves anybody, and it NEVER
 * RE-ENABLES anybody — a rehire is an administrator's explicit, logged
 * approval (`rehire.ts`), reachable from no automatic path.
 *
 * EVERY CONDITION. A row that fails one is recorded `skipped` with the code
 * shown and nothing is changed:
 *
 *   shadow_mode_required    WOVEN_ACCESS_MODE is not "shadow" (nothing runs)
 *   guard_blocked           a mass-change guard tripped on today's plan
 *   not_confirmed_link      not reached through a confirmed EmployeeID link
 *   protected_account       a role override; admin / owner / developer;
 *                           district_manager / regional_manager; or an id in
 *                           the app-switcher grant list — review only
 *   acting_account          the account of the person who triggered the run
 *   not_in_approved_batch   an EmployeeID allowlist is set and it is not on it
 *   review_<code>           the shadow-review gate is closed: no shadow run,
 *                           guard-tripped, stale (> 48 h), no review, review of
 *                           an older run, reviewer no longer an administrator
 *   not_in_reviewed_list    the employee is not on the administrator's list
 *   ...then the DATABASE re-checks everything under row locks
 *   (`employee_access_disable_terminated`): the link, its method and its
 *   recorded approver, managed_status, protection (it is passed the protected
 *   id list and refuses on its own), the pinned company on the directory row
 *   and the latest run, a successful latest sync, Terminated in the latest
 *   read, and the review. A refusal is recorded `failed` with its short code.
 *   Exempt from the review gate (and only from it): COMPLETING a revocation
 *   already started — the account is already disabled, so finishing the ban
 *   only tightens access.
 *
 * ATTEMPTED IS NOT COMPLETED. A run is `completed` only when no attempted
 * account failed; otherwise it is `partial` (some applied) or `failed` (none),
 * the response says so, and `incompleteAccounts` counts them. An account whose
 * profile was disabled but whose ban/session revocation or stamp failed keeps
 * `access_revoked_at` unset, so the planner proposes it again next run and the
 * completion path (no new review needed) finishes it. Every step is idempotent.
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
  /** The app-switcher grant list, handed to the database, which refuses these ids on its own. */
  protectedUserIds: readonly string[];
}

export interface TerminationRequest {
  requestedBy: string;
  /** The Ask Bubbles account that triggered this run, if a person did. The scheduled run has none. */
  actingUserId?: string | null;
  config: TerminationEnforcementConfig;
  /** WOVEN_ACCESS_MODE. Enforcement requires "shadow": shadow runs are what an administrator reviews. */
  accessMode: "off" | "shadow";
  now?: Date;
}

export interface TerminationTally {
  applied: number;
  failed: number;
  skipped: number;
}

export type TerminationOutcome =
  | { status: "off" }
  | { status: "blocked"; code: string }
  | { status: "aborted"; guardCodes: string[]; accessRunId: string | null }
  | {
      /** completed: no attempted account failed. partial: some applied, some did not. failed: none completed (or the run could not start). */
      status: "completed" | "partial" | "failed";
      tally: TerminationTally;
      /** Accounts attempted but not completed; retried next run. */
      incompleteAccounts: number;
      /** The review-gate code when it kept candidates from being disabled, else null. */
      gate: string | null;
      accessRunId: string | null;
      code?: string;
    };

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

/** Termination-protected, from a planned row (mirrors `isTerminationProtected` in plan.ts and the SQL). */
export function isRowTerminationProtected(account: NonNullable<PlannedRow["account"]>): boolean {
  return (
    account.isProtected ||
    (ADMIN_CONSOLE_ROLES as readonly Role[]).includes(account.role) ||
    WOVEN_TERMINATION_PROTECTED_ROLES.includes(account.role) ||
    APP_SWITCHER_USER_IDS.includes(account.appUserId.toLowerCase())
  );
}

/** The TypeScript-side conditions. Returns a skip code, or null when the row may go on to the gate and the database. */
export function skipReason(row: PlannedRow, request: TerminationRequest): string | null {
  const account = row.account;
  if (!account || account.via !== "link" || !row.externalEmployeeId || row.wovenStatus !== "terminated") return "not_confirmed_link";
  if (account.management !== "woven_linked") return "not_confirmed_link";
  if (isRowTerminationProtected(account)) return "protected_account";
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

interface Gate {
  ok: boolean;
  code: string;
  reviewId: string | null;
  approved: readonly string[];
}

/** The database's answer to "is there a clean, fresh, reviewed shadow run?". Unreadable = closed. */
async function readGate(deps: TerminationDeps): Promise<Gate> {
  try {
    const { data, error } = await deps.rpc("employee_access_review_state", {});
    const state = (data && typeof data === "object" ? data : null) as {
      ok?: unknown;
      code?: unknown;
      review_id?: unknown;
      approved_employee_ids?: unknown;
    } | null;
    if (error || !state) return { ok: false, code: "review_state_unavailable", reviewId: null, approved: [] };
    const code = typeof state.code === "string" && SAFE_CODE.test(state.code) ? state.code : "review_state_unavailable";
    if (state.ok !== true || typeof state.review_id !== "string" || !Array.isArray(state.approved_employee_ids)) {
      return { ok: false, code: state.ok === true ? "review_state_unavailable" : code, reviewId: null, approved: [] };
    }
    return { ok: true, code: "ok", reviewId: state.review_id, approved: state.approved_employee_ids.map(String) };
  } catch {
    return { ok: false, code: "review_state_unavailable", reviewId: null, approved: [] };
  }
}

export async function enforceTerminations(request: TerminationRequest, deps: TerminationDeps): Promise<TerminationOutcome> {
  if (!request.config.enabled) return { status: "off" };
  if (request.accessMode !== "shadow") return { status: "blocked", code: "shadow_mode_required" };
  const now = request.now ?? new Date();
  const setBy = `${TERMINATION_ACTOR_PREFIX}:${request.requestedBy}`.slice(0, 120);

  let plan: AccessPlan;
  try {
    plan = await deps.loadPlan(now);
  } catch {
    return { status: "failed", tally: { applied: 0, failed: 0, skipped: 0 }, incompleteAccounts: 0, gate: null, accessRunId: null, code: "plan_failed" };
  }

  const candidates = [...plan.rows].filter((r) => r.actions[0] === "DISABLE_TERMINATED").sort((a, b) => a.key.localeCompare(b.key));
  const recorded: RecordedAction[] = [];
  const tally: TerminationTally = { applied: 0, failed: 0, skipped: 0 };

  const finish = async (status: "completed" | "partial" | "failed" | "aborted", guardCodes: string[]): Promise<string | null> => {
    if (recorded.length === 0) return null;
    const { data, error } = await deps.rpc("employee_access_record_apply_run", {
      p_requested_by: request.requestedBy,
      p_directory_run_id: plan.directoryRunId,
      p_policy_version: plan.policyVersion,
      p_status: status,
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

  const gate = candidates.length > 0 ? await readGate(deps) : { ok: true, code: "ok", reviewId: null, approved: [] as string[] };
  let gateBlocked = false;

  for (const row of candidates) {
    const skip = skipReason(row, request);
    if (skip) {
      tally.skipped += 1;
      recorded.push(...record(row, "skipped", skip));
      continue;
    }
    /* Finishing a revocation already started (account already disabled) is not gated by the review. */
    const completing = row.account?.status === "disabled";
    if (!completing) {
      if (!gate.ok) {
        gateBlocked = true;
        tally.skipped += 1;
        recorded.push(...record(row, "skipped", `review_${gate.code}`));
        continue;
      }
      if (!gate.approved.includes(row.externalEmployeeId!)) {
        gateBlocked = true;
        tally.skipped += 1;
        recorded.push(...record(row, "skipped", "not_in_reviewed_list"));
        continue;
      }
    }
    const outcome = await disableOne(row, deps, setBy, gate.reviewId);
    if (outcome.ok) tally.applied += 1;
    else tally.failed += 1;
    recorded.push(...record(row, outcome.ok ? "applied" : "failed", outcome.code));
  }

  const status = tally.failed === 0 ? "completed" : tally.applied > 0 ? "partial" : "failed";
  const accessRunId = await finish(status, []);
  return { status, tally, incompleteAccounts: tally.failed, gate: gateBlocked ? gate.code : null, accessRunId };
}

async function disableOne(row: PlannedRow, deps: TerminationDeps, setBy: string, reviewId: string | null): Promise<{ ok: boolean; code: string }> {
  const appUserId = row.account?.appUserId;
  if (!appUserId || !row.externalEmployeeId) return { ok: false, code: "disable_input_incomplete" };

  try {
    const disabled = await deps.rpc("employee_access_disable_terminated", {
      p_app_user_id: appUserId,
      p_external_employee_id: row.externalEmployeeId,
      p_woven_company_id: deps.pinnedCompanyId,
      p_review_id: reviewId,
      p_protected_user_ids: [...deps.protectedUserIds],
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
