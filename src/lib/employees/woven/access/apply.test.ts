import { describe, expect, it, vi } from "vitest";

import { applyAccessLifecycle, refusalCode, type ApplyDeps } from "./apply";
import { buildAccessPlan, type AccessPlan } from "./build";
import type { WovenAccessConfig } from "./config";
import { ACCESS_GUARD_LIMITS, type DirectoryRunFacts } from "./guards";
import type { PlannerAccount, PlannerEmployee, PlannerInput } from "./types";

/**
 * ============================================================================
 * THE APPLY STEP (DISABLE_TERMINATED ONLY), WITH FAKE SERVICES
 * ============================================================================
 *
 * Owner, 28 Nov 2026: "make this automatic for both sunny and bubble". Every
 * effect goes through `ApplyDeps`, so these tests see exactly what the engine
 * asks the database and the auth revocation to do — and what it never asks.
 * The database half is `20261128003000_woven_disable_terminated.sql`.
 */

const NOW = new Date("2026-11-28T12:00:00Z");
const positions: PlannerInput["positions"] = [
  { wovenPositionId: "P-TM", status: "mapped", isConfirmed: true, role: "employee", scopeLevel: "location" },
  { wovenPositionId: "P-ASM", status: "mapped", isConfirmed: true, role: "assistant_manager", scopeLevel: "location" },
  { wovenPositionId: "P-LM", status: "mapped", isConfirmed: true, role: "location_manager", scopeLevel: "location" },
];
const locations: PlannerInput["locations"] = [
  { wovenLocationId: "L-0307", status: "mapped", locationCode: "0307", name: "Example Location 307" },
  { wovenLocationId: "L-0394", status: "mapped", locationCode: "0394", name: "Example Location 394" },
];
const employee = (id: string, over: Partial<PlannerEmployee> = {}): PlannerEmployee => ({
  externalEmployeeId: id,
  name: `Person ${id}`,
  emailAddress: `${id.toLowerCase()}@gmail.com`,
  employmentStatus: "active",
  missingSyncCount: 0,
  positionId: "P-ASM",
  positionName: "Assistant Manager",
  primaryWovenLocationId: "L-0307",
  primaryLocationName: "Example Location 307",
  additionalLocationNames: [],
  issues: [],
  terminationDate: null,
  lastSyncedAt: "2026-11-28T11:17:50Z",
  ...over,
});
const account = (n: number, over: Partial<PlannerAccount> = {}): PlannerAccount => ({
  appUserId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  email: `a${n}@gmail.com`,
  displayName: `Account ${n}`,
  role: "assistant_manager",
  status: "active",
  scopeLevel: "location",
  primaryAreaId: "loc-0307",
  alsoCoversAreaIds: [],
  management: null,
  linkedExternalEmployeeId: null,
  linkMethod: null,
  managedStatus: false,
  managedLocation: false,
  managedRole: false,
  terminatedAt: null,
  accessRevokedAt: null,
  override: null,
  ...over,
});
const linkedTo = (n: number, e: PlannerEmployee, over: Partial<PlannerAccount> = {}) =>
  account(n, { email: e.emailAddress!, management: "woven_linked", linkedExternalEmployeeId: e.externalEmployeeId, linkMethod: "admin_confirmed_email", managedStatus: true, ...over });

const healthyRuns: DirectoryRunFacts[] = [
  { status: "succeeded", finishedAt: "2026-11-28T11:18:30Z", employeesActive: 150, issueCounts: {} },
  { status: "succeeded", finishedAt: "2026-11-27T11:18:30Z", employeesActive: 150, issueCounts: {} },
];
/* An active, in-sync colleague: a directory with nobody active trips the zero_active_employees guard. */
const steady = employee("E-STEADY");
const steadyAccount = linkedTo(900, steady);
const planOf = (employees: PlannerEmployee[], accounts: PlannerAccount[] = [], runs = healthyRuns): AccessPlan =>
  buildAccessPlan(
    { employees: [...employees, steady], positions, locations, accounts: [...accounts, steadyAccount] },
    { runs, mappingBaseline: null, directoryRunId: "11111111-1111-4111-8111-111111111111", now: NOW },
  );

const config = (over: Partial<WovenAccessConfig> = {}): WovenAccessConfig => ({
  mode: "apply",
  applyActions: ["DISABLE_TERMINATED"],
  employeeAllowlist: null,
  problem: null,
  ...over,
});

type Handler = (args: Record<string, unknown>) => { data: unknown; error: { message?: string; code?: string } | null };

/** A recording fake of every service the engine uses. */
function fakes(plan: AccessPlan, over: { rpc?: Record<string, Handler> } & Partial<Omit<ApplyDeps, "rpc">> = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const recorded: Record<string, unknown>[] = [];
  const handlers: Record<string, Handler> = {
    employee_access_begin_apply_run: () => ({ data: "run-1", error: null }),
    employee_access_finish_apply_run: () => ({ data: null, error: null }),
    employee_access_record_apply_actions: (args) => {
      recorded.push(...(args.p_actions as Record<string, unknown>[]));
      return { data: 1, error: null };
    },
    employee_access_disable_terminated: () => ({ data: "disabled.link", error: null }),
    employee_access_record_revocation: () => ({ data: null, error: null }),
    ...over.rpc,
  };
  const deps: ApplyDeps = {
    loadPlan: over.loadPlan ?? (async () => plan),
    rpc: (fn, args) => {
      calls.push({ fn, args });
      const handler = handlers[fn];
      if (!handler) throw new Error(`unexpected rpc ${fn}`);
      return Promise.resolve(handler(args));
    },
    revokeAuthAccess: over.revokeAuthAccess ?? vi.fn(async () => ({ ok: true, failed: [] })),
  };
  const fnsCalled = () => calls.map((c) => c.fn);
  const callsOf = (fn: string) => calls.filter((c) => c.fn === fn).map((c) => c.args);
  return { deps, calls, recorded, fnsCalled, callsOf };
}

const run = (f: ReturnType<typeof fakes>, over: Partial<WovenAccessConfig> = {}) => applyAccessLifecycle({ requestedBy: "cron", config: config(over), now: NOW }, f.deps);
const primaryOf = (f: ReturnType<typeof fakes>, action: string) => f.recorded.filter((r) => r.is_primary && r.action === action);

describe("mode and lock", () => {
  it("does nothing at all unless the mode is apply", async () => {
    const f = fakes(planOf([employee("E1", { employmentStatus: "terminated" })]));
    expect(await run(f, { mode: "shadow" })).toEqual({ status: "off" });
    expect(await run(f, { mode: "off" })).toEqual({ status: "off" });
    expect(f.calls).toEqual([]);
  });

  it("a second concurrent run is refused at the lock and touches nothing", async () => {
    const f = fakes(planOf([]), { rpc: { employee_access_begin_apply_run: () => ({ data: null, error: { message: "employee_access_apply_in_progress", code: "55P03" } }) } });
    expect(await run(f)).toEqual({ status: "busy" });
    expect(f.fnsCalled()).toEqual(["employee_access_begin_apply_run"]);
    expect(f.deps.revokeAuthAccess).not.toHaveBeenCalled();
  });
});

describe("DISABLE_TERMINATED", () => {
  const terminated = employee("E9", { employmentStatus: "terminated", terminationDate: "2026-11-20" });

  it("a linked, status-managed account: the database disables (re-checking Terminated), then ban + sessions, then the record", async () => {
    const linked = linkedTo(9, terminated);
    const f = fakes(planOf([terminated], [linked]));
    expect(await run(f)).toMatchObject({ status: "completed", tally: { applied: { DISABLE_TERMINATED: 1 }, failed: {}, skipped: 0 } });
    expect(f.fnsCalled().filter((x) => x === "employee_access_disable_terminated" || x === "employee_access_record_revocation")).toEqual([
      "employee_access_disable_terminated",
      "employee_access_record_revocation",
    ]);
    expect(f.callsOf("employee_access_disable_terminated")[0]).toEqual({ p_app_user_id: linked.appUserId, p_external_employee_id: "E9", p_set_by: "woven-access-sync:cron" });
    expect(f.deps.revokeAuthAccess).toHaveBeenCalledWith(linked.appUserId);
    expect(f.callsOf("employee_access_record_revocation")[0]).toMatchObject({ p_ok: true, p_detail: "auth_ban,sessions_revoked" });
    expect(primaryOf(f, "DISABLE_TERMINATED")[0]).toMatchObject({ result: "applied", result_code: "disabled.link.auth_revoked", app_user_id: linked.appUserId });
    expect(f.callsOf("employee_access_finish_apply_run")[0]).toMatchObject({ p_status: "completed" });
  });

  it("the 26 Oct case: an assistant manager terminated in Woven, active account never linked, same email → disabled", async () => {
    const am = employee("E-AM", { employmentStatus: "terminated", terminationDate: "2026-10-26", emailAddress: "Former.AM@Gmail.com" });
    const unlinked = account(26, { email: "former.am@gmail.com", role: "assistant_manager" });
    const f = fakes(planOf([am], [unlinked]), { rpc: { employee_access_disable_terminated: () => ({ data: "disabled.email_match", error: null }) } });
    await run(f);
    expect(f.callsOf("employee_access_disable_terminated")).toEqual([{ p_app_user_id: unlinked.appUserId, p_external_employee_id: "E-AM", p_set_by: "woven-access-sync:cron" }]);
    expect(f.deps.revokeAuthAccess).toHaveBeenCalledWith(unlinked.appUserId);
    expect(primaryOf(f, "DISABLE_TERMINATED")[0]).toMatchObject({
      result: "applied",
      result_code: "disabled.email_match.auth_revoked",
      reason_codes: ["terminated_in_woven", "single_exact_email_match"],
    });
  });

  it("never an administrator, a protected override, a not-Woven-managed or a status-unmanaged account", async () => {
    const a = employee("E-A", { employmentStatus: "terminated" });
    const b = employee("E-B", { employmentStatus: "terminated" });
    const c = employee("E-C", { employmentStatus: "terminated" });
    const d = employee("E-D", { employmentStatus: "terminated" });
    const e = employee("E-E", { employmentStatus: "terminated" });
    const accounts = [
      account(1, { email: a.emailAddress!, role: "owner", scopeLevel: "global", primaryAreaId: null }),
      linkedTo(2, b, { role: "admin", scopeLevel: "global", primaryAreaId: null }),
      account(3, { email: c.emailAddress!, override: { role: "assistant_manager", scopeLevel: "location", externalEmployeeId: null } }),
      account(4, { email: d.emailAddress!, management: "not_woven_managed" }),
      linkedTo(5, e, { managedStatus: false }),
    ];
    const f = fakes(planOf([a, b, c, d, e], accounts));
    expect(await run(f)).toMatchObject({ status: "completed", tally: { applied: {}, failed: {} } });
    expect(f.fnsCalled()).not.toContain("employee_access_disable_terminated");
    expect(f.deps.revokeAuthAccess).not.toHaveBeenCalled();
    expect(primaryOf(f, "DISABLE_TERMINATED")).toEqual([]);
  });

  it("a partial auth revocation is recorded as failed and incomplete — the next run completes it", async () => {
    const f = fakes(planOf([terminated], [linkedTo(9, terminated)]), { revokeAuthAccess: vi.fn(async () => ({ ok: false, failed: ["sessions"] })) });
    expect(await run(f)).toMatchObject({ status: "completed", tally: { failed: { DISABLE_TERMINATED: 1 } } });
    expect(f.callsOf("employee_access_record_revocation")[0]).toMatchObject({ p_ok: false, p_detail: "failed:sessions" });
    expect(primaryOf(f, "DISABLE_TERMINATED")[0]).toMatchObject({ result: "failed", result_code: "auth_revocation_incomplete.sessions" });
  });

  it("the database refuses (e.g. no longer Terminated in the latest read) → nothing banned, its code recorded", async () => {
    const f = fakes(planOf([terminated], [linkedTo(9, terminated)]), {
      rpc: { employee_access_disable_terminated: () => ({ data: null, error: { message: "disable_not_terminated_in_latest_read" } }) },
    });
    await run(f);
    expect(f.deps.revokeAuthAccess).not.toHaveBeenCalled();
    expect(primaryOf(f, "DISABLE_TERMINATED")[0]).toMatchObject({ result: "failed", result_code: "disable_not_terminated_in_latest_read" });
  });

  it("a repeated run over the applied state does nothing (idempotent)", async () => {
    const done = linkedTo(9, terminated, { status: "disabled", terminatedAt: "2026-11-28T12:00:00Z", accessRevokedAt: "2026-11-28T12:00:00Z" });
    const f = fakes(planOf([terminated], [done]));
    expect(await run(f)).toMatchObject({ status: "completed", tally: { applied: {}, failed: {}, skipped: 0 } });
    expect(new Set(f.fnsCalled())).toEqual(new Set(["employee_access_begin_apply_run", "employee_access_record_apply_actions", "employee_access_finish_apply_run"]));
  });

  it("records codes only: no name and no email reaches the run record", async () => {
    const am = employee("E-AM", { employmentStatus: "terminated", name: "Distinctive Name", emailAddress: "distinctive.person@gmail.com" });
    /* And a would-be new account (CREATE_USER, never applied here), whose proposal names the person. */
    const hire = employee("E-NEW", { name: "Another Distinctive", emailAddress: "another.distinctive@gmail.com" });
    const plan = planOf([am, hire], [account(26, { email: "distinctive.person@gmail.com", displayName: "Distinctive Name" })]);
    expect(JSON.stringify(plan.rows.find((r) => r.externalEmployeeId === "E-NEW")!.after)).toMatch(/another\.distinctive/);
    const f = fakes(plan);
    await run(f);
    expect(f.recorded.find((r) => r.external_employee_id === "E-NEW" && r.is_primary)).toMatchObject({ action: "CREATE_USER", result: "skipped" });
    const written = JSON.stringify(f.calls.filter((c) => c.fn !== "employee_access_disable_terminated" && c.fn !== "employee_access_record_revocation"));
    expect(written).not.toMatch(/Distinctive|distinctive\.person|@gmail/i);
  });
});

describe("guards", () => {
  const terminated = employee("E2", { employmentStatus: "terminated" });
  const linked = linkedTo(2, terminated);

  it.each([
    ["the Woven sync failed", [{ ...healthyRuns[0]!, status: "failed" as const }, ...healthyRuns]],
    ["the directory is stale", [{ ...healthyRuns[0]!, finishedAt: "2026-11-26T00:00:00Z" }, healthyRuns[1]!]],
    ["the terminated-status read failed", [{ ...healthyRuns[0]!, issueCounts: { terminated_status_read_failed_http: 1 } }, healthyRuns[1]!]],
    ["the status enum was unresolved", [{ ...healthyRuns[0]!, issueCounts: { enums_unavailable: 1 } }, healthyRuns[1]!]],
    ["active employees dropped below the retained percent", [{ ...healthyRuns[0]!, employeesActive: 100 }, healthyRuns[1]!]],
  ])("abort every disable when %s: recorded as skipped, run aborted", async (_name, runs) => {
    const f = fakes(planOf([terminated], [linked], runs));
    const outcome = await run(f);
    expect(outcome.status).toBe("aborted");
    expect(f.fnsCalled()).not.toContain("employee_access_disable_terminated");
    expect(f.deps.revokeAuthAccess).not.toHaveBeenCalled();
    expect(primaryOf(f, "DISABLE_TERMINATED").map((r) => [r.result, r.result_code])).toEqual([["skipped", "guard_blocked"]]);
    expect(f.callsOf("employee_access_finish_apply_run")[0]).toMatchObject({ p_status: "aborted" });
  });

  it("terminations above the cap (max 3, 5% of managed active accounts) abort the whole run — nobody is disabled", async () => {
    const leavers = ["T1", "T2", "T3", "T4"].map((id) => employee(id, { employmentStatus: "terminated" }));
    /* Two linked, two found by email: both count against the cap. */
    const accounts = [linkedTo(10, leavers[0]!), linkedTo(11, leavers[1]!), account(12, { email: leavers[2]!.emailAddress! }), account(13, { email: leavers[3]!.emailAddress! })];
    const plan = planOf(leavers, accounts);
    expect(plan.counts.DISABLE_TERMINATED).toBe(4);
    const f = fakes(plan);
    expect(await run(f)).toMatchObject({ status: "aborted", guardCodes: expect.arrayContaining(["terminations_exceed_threshold"]) });
    expect(f.deps.revokeAuthAccess).not.toHaveBeenCalled();
    expect(primaryOf(f, "DISABLE_TERMINATED").every((r) => r.result_code === "guard_blocked")).toBe(true);
  });

  it("guards that count only actions this app never applies (account creation) are recorded but do not block a disable", async () => {
    const eligible = Array.from({ length: ACCESS_GUARD_LIMITS.maxCreates + 1 }, (_, i) => employee(`N${i}`, { positionId: "P-TM" }));
    const plan = planOf([terminated, ...eligible], [linked]);
    expect(plan.guard.codes).toEqual(["creates_exceed_batch_limit"]);
    const f = fakes(plan);
    expect(await run(f)).toMatchObject({ status: "completed", tally: { applied: { DISABLE_TERMINATED: 1 } } });
    expect(f.callsOf("employee_access_finish_apply_run")[0]).toMatchObject({ p_status: "completed", p_counts: { guardCodes: ["creates_exceed_batch_limit"] } });
  });
});

describe("controlled rollout", () => {
  const terminated = employee("E9", { employmentStatus: "terminated" });
  const linked = linkedTo(9, terminated);

  it("apply with no capability listed applies nothing: recorded as skipped (capability_off)", async () => {
    const f = fakes(planOf([terminated], [linked]));
    await run(f, { applyActions: [] });
    expect(f.deps.revokeAuthAccess).not.toHaveBeenCalled();
    expect(primaryOf(f, "DISABLE_TERMINATED")[0]).toMatchObject({ result: "skipped", result_code: "capability_off" });
  });

  it("with a batch allowlist, only those EmployeeIDs are touched", async () => {
    const other = employee("E8", { employmentStatus: "terminated" });
    const f = fakes(planOf([terminated, other], [linked, linkedTo(8, other)]));
    await run(f, { employeeAllowlist: ["E9"] });
    expect(f.callsOf("employee_access_disable_terminated").map((a) => a.p_external_employee_id)).toEqual(["E9"]);
    expect(f.recorded.find((r) => r.external_employee_id === "E8" && r.is_primary)).toMatchObject({ result: "skipped", result_code: "not_in_approved_batch" });
  });

  it("CREATE_USER, UPDATE_ROLE and UPDATE_PRIMARY_LOCATION are never applied here — no account created, no role or location moved", async () => {
    const newHire = employee("E1");
    const moved = employee("E5", { primaryWovenLocationId: "L-0394" });
    const promoted = employee("E6", { positionId: "P-LM" });
    const accounts = [
      linkedTo(5, moved, { managedLocation: true, managedRole: true }),
      linkedTo(6, promoted, { managedLocation: true, managedRole: true }),
    ];
    const plan = planOf([newHire, moved, promoted], accounts);
    expect(plan.rows.flatMap((r) => r.actions)).toEqual(expect.arrayContaining(["CREATE_USER", "UPDATE_PRIMARY_LOCATION", "UPDATE_ROLE"]));
    const f = fakes(plan);
    await run(f);
    const skipped = f.recorded.filter((r) => r.is_primary && ["CREATE_USER", "UPDATE_ROLE", "UPDATE_PRIMARY_LOCATION"].includes(String(r.action)));
    expect(skipped.map((r) => [r.result, r.result_code])).toEqual([
      ["skipped", "not_applied_in_ask_bubbles"],
      ["skipped", "not_applied_in_ask_bubbles"],
      ["skipped", "not_applied_in_ask_bubbles"],
    ]);
    /* Nothing but the run record was asked of the database. */
    expect(new Set(f.fnsCalled())).toEqual(new Set(["employee_access_begin_apply_run", "employee_access_record_apply_actions", "employee_access_finish_apply_run"]));
  });

  it("an error mid-run closes the run as failed", async () => {
    let loads = 0;
    const f = fakes(planOf([]), {
      loadPlan: async () => {
        loads += 1;
        if (loads > 1) throw new Error("db down");
        return planOf([]);
      },
    });
    expect(await run(f)).toMatchObject({ status: "failed", code: "apply_interrupted" });
    expect(f.callsOf("employee_access_finish_apply_run")[0]).toMatchObject({ p_status: "failed" });
  });
});

describe("refusalCode", () => {
  it("passes only the database's own short codes, never a provider message", () => {
    expect(refusalCode({ message: "disable_protected_account" }, "x")).toBe("disable_protected_account");
    expect(refusalCode({ message: "duplicate key value violates unique constraint \"x\" for someone@gmail.com" }, "disable_refused")).toBe("disable_refused");
    expect(refusalCode(null, "disable_refused")).toBe("disable_refused");
  });
});

/*
 * "SIGN-IN TURNED OFF" IN THE BELL (owner, 28 Nov 2026): "can we get notifications too in the app when we disable log
 * ins please? when someone is terminated". The run hands the administrators' notices the people it disabled, and only
 * those.
 */
describe("the administrators hear about every sign-in turned off", () => {
  const gone = employee("E7", { employmentStatus: "terminated" });
  const steady = employee("E6");
  const planOfDisable = (who: ReturnType<typeof employee>, _colleague: ReturnType<typeof employee>) => planOf([who], [linkedTo(7, who)]);

  it("a disable that went through is handed to the notices, once, with the person's name", async () => {
    const plan = planOfDisable(gone, steady);
    const f = fakes(plan);
    const notify = vi.fn(async () => undefined);
    f.deps.notifyDisabled = notify;
    await run(f);
    expect(notify).toHaveBeenCalledTimes(1);
    // CHANGED ON PURPOSE (Pau, 28 Nov 2026: "add the reason like terminated X date, position X location X"): the notice
    // also gets the person's Woven EmployeeID (for the dates), position and locations, not the name alone.
    expect(notify).toHaveBeenCalledWith([
      {
        name: expect.any(String),
        externalEmployeeId: expect.any(String),
        position: expect.toSatisfy((v: unknown) => v === null || typeof v === "string"),
        primaryLocation: expect.toSatisfy((v: unknown) => v === null || typeof v === "string"),
        additionalLocations: expect.any(Array),
      },
    ]);
    expect((notify.mock.calls[0] as unknown as [{ name: string }[]])[0][0]!.name.length).toBeGreaterThan(0);
  });

  it("a disable the database refused rings nobody", async () => {
    const plan = planOfDisable(gone, steady);
    const f = fakes(plan, { rpc: { employee_access_disable_terminated: () => ({ data: null, error: { message: "not_terminated_in_latest_read", code: "P0001" } }) } });
    const notify = vi.fn(async () => undefined);
    f.deps.notifyDisabled = notify;
    await run(f);
    expect(notify).not.toHaveBeenCalled();
  });

  it("a notice that fails never fails the run", async () => {
    const f = fakes(planOfDisable(gone, steady));
    f.deps.notifyDisabled = vi.fn(async () => {
      throw new Error("bell down");
    });
    expect(await run(f)).toMatchObject({ status: "completed" });
  });
});
