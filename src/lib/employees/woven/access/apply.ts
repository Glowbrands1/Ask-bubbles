import type { AccessPlan } from "./build";
import type { WovenAccessConfig } from "./config";
import { NOT_APPLIED_ACTION_GUARDS, type AccessGuardCode } from "./guards";
import { isApplyCapability, isMutating, type AccessAction, type ApplyCapability, type PlannedRow } from "./types";

/**
 * ============================================================================
 * THE APPLY STEP — disable an account when Woven says Terminated, and nothing else
 * ============================================================================
 *
 * Owner, 28 Nov 2026: "make this automatic for both sunny and bubble". Ported
 * from the sibling app's account lifecycle for ONE action, DISABLE_TERMINATED.
 * Runs only in `WOVEN_ACCESS_MODE=apply` with DISABLE_TERMINATED named in
 * WOVEN_ACCESS_APPLY_ACTIONS, and only for the EmployeeIDs in
 * WOVEN_ACCESS_APPLY_EMPLOYEE_IDS while that is set (`config.ts`). The cron
 * route calls it only after a SUCCESSFUL directory sync.
 *
 * THE ORDER OF EVERY RUN
 *
 *   1. Take the run lock (`employee_access_begin_apply_run`): one apply run at
 *      a time, enforced by a unique index. A second run gets `busy`.
 *   2. Plan from the database AFTER the lock, so the plan is the current one.
 *   3. Guards. One tripped guard and the run applies NOTHING: it is recorded as
 *      `aborted`, every would-be mutation as `skipped` (guard_blocked). The
 *      guards that count only actions this app never applies (creates,
 *      location moves, role changes — `NOT_APPLIED_ACTION_GUARDS`) are recorded
 *      but do not block a disable: they would otherwise stop every run while
 *      the preview lists eligible people without accounts.
 *   4. Each row whose primary action is DISABLE_TERMINATED, enabled and in the
 *      batch, is applied: the profile is disabled by the database (which
 *      re-checks Terminated, the link or the exact email match, protection,
 *      under row locks, and refuses with a named code if anything moved), then
 *      the authentication layer is revoked (ban + every session), then the
 *      revocation is recorded on the link.
 *   5. Every row is recorded (`employee_access_actions`): applied, failed,
 *      skipped or planned, with a short result code — never a name or an
 *      email. The run is closed.
 *
 * WHAT IT NEVER DOES: create an account, send or resend an invitation, link
 * an Active employee, change a role, a scope or a location, re-enable anybody,
 * or delete anything. CREATE_USER, UPDATE_ROLE and UPDATE_PRIMARY_LOCATION are
 * recorded `skipped`, `not_applied_in_ask_bubbles`, whatever the configuration.
 *
 * Pure orchestration: every effect goes through `ApplyDeps`, so the unit tests
 * drive it with fakes.
 */

export interface RpcResult {
  data: unknown;
  error: { message?: string; code?: string } | null;
}

export interface ApplyDeps {
  loadPlan(now: Date): Promise<AccessPlan>;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  revokeAuthAccess(userId: string): Promise<{ ok: boolean; failed: string[] }>;
  /** The administrators' bell items for the sign-ins turned off in this run (`src/lib/admin/disable-notices.ts`). Absent: none. */
  notifyDisabled?(people: { name: string }[]): Promise<void>;
}

export interface ApplyRequest {
  requestedBy: string;
  config: WovenAccessConfig;
  now?: Date;
}

export type ActionResult = "applied" | "failed" | "skipped" | "planned";

export interface ApplyTally {
  applied: Partial<Record<ApplyCapability, number>>;
  failed: Partial<Record<ApplyCapability, number>>;
  skipped: number;
}

export type ApplyOutcome =
  | { status: "off" }
  | { status: "busy" }
  | { status: "aborted"; accessRunId: string; guardCodes: string[] }
  | { status: "completed"; accessRunId: string; tally: ApplyTally }
  | { status: "failed"; code: string; accessRunId: string | null };

interface RecordedAction {
  external_employee_id: string | null;
  app_user_id: string | null;
  action: AccessAction;
  is_primary: boolean;
  reason_codes: string[];
  before_values: PlannedRow["before"];
  after_values: PlannedRow["after"];
  woven_source_at: string | null;
  result: ActionResult;
  result_code: string | null;
}

const SAFE_CODE = /^[a-z0-9_.:-]{1,80}$/;
/** The database functions raise their own short codes; anything else is not passed on. */
export function refusalCode(error: { message?: string; code?: string } | null | undefined, fallback: string): string {
  const message = (error?.message ?? "").trim();
  return SAFE_CODE.test(message) ? message : fallback;
}

/** The guard codes that stop this app's apply step: all of them except those counting actions it never applies. */
export function blockingGuardCodes(codes: readonly AccessGuardCode[]): AccessGuardCode[] {
  return codes.filter((c) => !(NOT_APPLIED_ACTION_GUARDS as readonly string[]).includes(c));
}

/** Values that would carry a person's name or address (a CREATE_USER proposal) are not written by an apply run. */
const PERSONAL_KEYS = ["email", "display_name"];
function withoutPersonal(values: PlannedRow["before"]): PlannedRow["before"] {
  if (!values) return values;
  return Object.fromEntries(Object.entries(values).filter(([key]) => !PERSONAL_KEYS.includes(key)));
}

function recordRow(row: PlannedRow, primary: { result: ActionResult; code: string | null }, appUserId: string | null = row.appUserId): RecordedAction[] {
  return row.actions.map((action, index) => ({
    external_employee_id: row.externalEmployeeId,
    app_user_id: appUserId,
    action,
    is_primary: index === 0,
    reason_codes: row.reasons,
    before_values: index === 0 ? withoutPersonal(row.before) : null,
    after_values: index === 0 ? withoutPersonal(row.after) : null,
    woven_source_at: row.wovenSourceAt,
    result: index === 0 ? primary.result : "planned",
    result_code: index === 0 ? primary.code : null,
  }));
}

export async function applyAccessLifecycle(request: ApplyRequest, deps: ApplyDeps): Promise<ApplyOutcome> {
  const { config } = request;
  if (config.mode !== "apply") return { status: "off" };
  const now = request.now ?? new Date();
  const setBy = `woven-access-sync:${request.requestedBy}`.slice(0, 120);

  /* 1. the lock */
  let probe: AccessPlan;
  try {
    probe = await deps.loadPlan(now);
  } catch {
    return { status: "failed", code: "plan_failed", accessRunId: null };
  }
  const begun = await deps.rpc("employee_access_begin_apply_run", {
    p_requested_by: request.requestedBy,
    p_directory_run_id: probe.directoryRunId,
    p_policy_version: probe.policyVersion,
  });
  if (begun.error) {
    return (begun.error.message ?? "").includes("employee_access_apply_in_progress") || begun.error.code === "55P03"
      ? { status: "busy" }
      : { status: "failed", code: "begin_failed", accessRunId: null };
  }
  const runId = String(begun.data);

  const recorded: RecordedAction[] = [];
  const tally: ApplyTally = { applied: {}, failed: {}, skipped: 0 };
  const bump = (bucket: "applied" | "failed", key: ApplyCapability) => (tally[bucket][key] = (tally[bucket][key] ?? 0) + 1);
  const flush = async () => {
    if (recorded.length === 0) return;
    const batch = recorded.splice(0, recorded.length);
    const { error } = await deps.rpc("employee_access_record_apply_actions", { p_run: runId, p_actions: batch });
    if (error) throw new Error("record_failed");
  };

  try {
    /* 2. the plan, after the lock */
    const plan = await deps.loadPlan(now);
    const enabled = new Set<string>(config.applyActions);
    /* Owner, 28 Nov 2026: the administrators hear about every sign-in turned off (`src/lib/admin/disable-notices.ts`). */
    const disabledPeople: { name: string }[] = [];
    const inBatch = (row: PlannedRow) => config.employeeAllowlist === null || (row.externalEmployeeId !== null && config.employeeAllowlist.includes(row.externalEmployeeId));
    const rows = [...plan.rows].sort((a, b) => a.key.localeCompare(b.key));
    const counts = { actions: plan.counts, guard: plan.guard.details, guardCodes: plan.guard.codes, mappings: plan.mappings };

    /* 3. the guards */
    const blocking = blockingGuardCodes(plan.guard.codes);
    if (blocking.length > 0) {
      for (const row of rows) {
        const primary = row.actions[0]!;
        recorded.push(...recordRow(row, isMutating(primary) ? { result: "skipped", code: "guard_blocked" } : { result: "planned", code: null }));
      }
      await flush();
      await deps.rpc("employee_access_finish_apply_run", { p_run: runId, p_status: "aborted", p_guard_codes: blocking, p_counts: counts });
      return { status: "aborted", accessRunId: runId, guardCodes: blocking };
    }

    /* 4. the disables */
    for (const row of rows) {
      const primary = row.actions[0]!;
      if (!isMutating(primary)) {
        recorded.push(...recordRow(row, { result: "planned", code: null }));
        continue;
      }
      if (!isApplyCapability(primary)) {
        /* CREATE_USER / UPDATE_ROLE / UPDATE_PRIMARY_LOCATION: preview only here, never applied. */
        tally.skipped += 1;
        recorded.push(...recordRow(row, { result: "skipped", code: "not_applied_in_ask_bubbles" }));
        continue;
      }
      if (!enabled.has(primary)) {
        tally.skipped += 1;
        recorded.push(...recordRow(row, { result: "skipped", code: "capability_off" }));
        continue;
      }
      if (!inBatch(row)) {
        tally.skipped += 1;
        recorded.push(...recordRow(row, { result: "skipped", code: "not_in_approved_batch" }));
        continue;
      }

      const outcome = await disableTerminated(row, deps, setBy);
      bump(outcome.result, primary);
      if (primary === "DISABLE_TERMINATED" && outcome.result === "applied") disabledPeople.push({ name: row.employeeName });
      recorded.push(...recordRow(row, { result: outcome.result, code: outcome.code }, outcome.appUserId ?? row.appUserId));
      /* Recorded at once, so a run that dies later still shows what it did. */
      await flush();
    }

    if (disabledPeople.length > 0) await deps.notifyDisabled?.(disabledPeople).catch(() => undefined);

    /* 5. the record */
    await flush();
    await deps.rpc("employee_access_finish_apply_run", { p_run: runId, p_status: "completed", p_guard_codes: [], p_counts: { ...counts, tally } });
    return { status: "completed", accessRunId: runId, tally };
  } catch {
    await flush().catch(() => undefined);
    await Promise.resolve(
      deps.rpc("employee_access_finish_apply_run", { p_run: runId, p_status: "failed", p_guard_codes: [], p_counts: { tally } }),
    ).catch(() => undefined);
    return { status: "failed", code: "apply_interrupted", accessRunId: runId };
  }
}

/* --------------------------------------------------- DISABLE_TERMINATED -- */

interface StepOutcome {
  result: "applied" | "failed";
  code: string;
  appUserId?: string | null;
}

/**
 * Profile first (disabled, inside a transaction that re-checks Woven's
 * Terminated status and the account — and, for an exact email match, stores
 * the link), then the authentication layer (ban + every session and refresh
 * token), then the record. A partial failure leaves the account disabled and
 * the link without `access_revoked_at`, so the next run proposes
 * DISABLE_TERMINATED again, through the link, and completes it; every step is
 * idempotent.
 */
async function disableTerminated(row: PlannedRow, deps: ApplyDeps, setBy: string): Promise<StepOutcome> {
  const appUserId = row.account?.appUserId ?? null;
  if (!appUserId || !row.externalEmployeeId) return { result: "failed", code: "disable_input_incomplete" };
  const disabled = await deps.rpc("employee_access_disable_terminated", {
    p_app_user_id: appUserId,
    p_external_employee_id: row.externalEmployeeId,
    p_set_by: setBy,
  });
  if (disabled.error) return { result: "failed", code: refusalCode(disabled.error, "disable_refused"), appUserId };

  const revoked = await deps.revokeAuthAccess(appUserId);
  const recorded = await deps.rpc("employee_access_record_revocation", {
    p_app_user_id: appUserId,
    p_ok: revoked.ok,
    p_detail: revoked.ok ? "auth_ban,sessions_revoked" : `failed:${revoked.failed.join(",")}`,
    p_set_by: setBy,
  });
  if (!revoked.ok) return { result: "failed", code: `auth_revocation_incomplete.${revoked.failed.join("_")}`.slice(0, 80), appUserId };
  if (recorded.error) return { result: "failed", code: "revocation_not_recorded", appUserId };
  const done = String(disabled.data);
  return { result: "applied", code: `${SAFE_CODE.test(done) ? done : "disabled"}.auth_revoked`.slice(0, 80), appUserId };
}
