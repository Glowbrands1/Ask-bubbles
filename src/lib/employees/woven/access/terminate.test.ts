import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WOVEN_TENANT, WOVEN_TERMINATION_PROTECTED_ROLES } from "@/config/company/woven";
import { APP_SWITCHER_USER_IDS } from "@/lib/auth/app-switcher-users";
import { ADMIN_CONSOLE_ROLES } from "@/lib/permissions";

import { PINNED_COMPANY_ID } from "../config";
import { buildAccessPlan, type AccessPlan } from "./build";
import type { DirectoryRunFacts } from "./guards";
import { enforceTerminations, refusalCode, type RpcResult, type TerminationDeps, type TerminationRequest } from "./terminate";
import { readTerminationEnforcement } from "./termination-config";
import type { PlannerAccount, PlannerEmployee, PlannerInput } from "./types";

/**
 * ============================================================================
 * TERMINATION ENFORCEMENT, CASE BY CASE — pure orchestration, fake effects
 * ============================================================================
 * The database half is executed in supabase/tests/woven_disable_terminated_checks.sql.
 */

const NOW = new Date("2026-10-19T12:00:00Z");
const REVIEW_ID = "33333333-3333-4333-8333-333333333333";

const positions: PlannerInput["positions"] = [
  { wovenPositionId: "P-LM", status: "mapped", isConfirmed: true, role: "location_manager", scopeLevel: "location" },
  { wovenPositionId: "P-DM", status: "mapped", isConfirmed: true, role: "district_manager", scopeLevel: "district" },
];
const locations: PlannerInput["locations"] = [{ wovenLocationId: "L-1", status: "mapped", locationCode: "0307", name: "Example Location 307" }];

let seq = 0;
function employee(overrides: Partial<PlannerEmployee> = {}): PlannerEmployee {
  seq += 1;
  return {
    externalEmployeeId: `E${String(seq).padStart(3, "0")}`,
    name: `Person ${seq}`,
    emailAddress: `person${seq}@gmail.com`,
    employmentStatus: "terminated",
    missingSyncCount: 0,
    positionId: "P-LM",
    positionName: "Location Manager",
    primaryWovenLocationId: "L-1",
    primaryLocationName: "Example Location 307",
    additionalLocationNames: [],
    issues: [],
    terminationDate: "2026-10-15",
    lastSyncedAt: "2026-10-19T11:17:50Z",
    ...overrides,
  };
}

let userSeq = 0;
function account(e: PlannerEmployee | null, overrides: Partial<PlannerAccount> = {}): PlannerAccount {
  userSeq += 1;
  return {
    appUserId: `00000000-0000-4000-8000-${String(userSeq).padStart(12, "0")}`,
    email: e?.emailAddress ?? `account${userSeq}@gmail.com`,
    displayName: `Account ${userSeq}`,
    role: "location_manager",
    status: "active",
    scopeLevel: "location",
    primaryAreaId: "loc-0307",
    alsoCoversAreaIds: [],
    management: e ? "woven_linked" : null,
    linkedExternalEmployeeId: e?.externalEmployeeId ?? null,
    linkMethod: e ? "admin_confirmed_email" : null,
    managedStatus: e !== null,
    managedLocation: false,
    managedRole: false,
    terminatedAt: null,
    accessRevokedAt: null,
    override: null,
    ...overrides,
  };
}

const HEALTHY_RUN = { status: "succeeded" as const, finishedAt: "2026-10-19T11:18:00Z", employeesActive: 50, issueCounts: {} };

/** One active bystander keeps the "zero active employees" guard quiet. */
function healthy(employees: PlannerEmployee[], accounts: PlannerAccount[], runs: DirectoryRunFacts[] = [HEALTHY_RUN]): AccessPlan {
  const bystander = employee({ employmentStatus: "active", terminationDate: null });
  return buildAccessPlan(
    { employees: [...employees, bystander], positions, locations, accounts },
    { runs, mappingBaseline: null, directoryRunId: "11111111-1111-4111-8111-111111111111", now: NOW },
  );
}

interface Call {
  fn: string;
  args: Record<string, unknown>;
}

interface Options {
  /** account id -> short code the disable function refuses with */
  refuse?: Record<string, string>;
  revoke?: { ok: boolean; failed: string[] } | ((id: string) => { ok: boolean; failed: string[] });
  /** override the review gate; default: open, approving every candidate's EmployeeID */
  gate?: { ok: boolean; code: string } | "error" | "throw";
  approve?: string[];
  stampFails?: boolean;
}

function harness(plan: AccessPlan, opts: Options = {}) {
  const calls: Call[] = [];
  const revoked: string[] = [];
  const candidateIds = plan.rows.filter((r) => r.actions[0] === "DISABLE_TERMINATED").map((r) => r.externalEmployeeId!);
  const deps: TerminationDeps = {
    pinnedCompanyId: PINNED_COMPANY_ID,
    protectedUserIds: APP_SWITCHER_USER_IDS,
    loadPlan: async () => plan,
    rpc: async (fn, args): Promise<RpcResult> => {
      calls.push({ fn, args });
      if (fn === "employee_access_review_state") {
        if (opts.gate === "throw") throw new Error("down");
        if (opts.gate === "error") return { data: null, error: { message: "boom" } };
        if (opts.gate && !opts.gate.ok) return { data: { ok: false, code: opts.gate.code }, error: null };
        return { data: { ok: true, code: "ok", shadow_run_id: "s", review_id: REVIEW_ID, approved_employee_ids: opts.approve ?? candidateIds }, error: null };
      }
      if (fn === "employee_access_record_apply_run") return { data: "22222222-2222-4222-8222-222222222222", error: null };
      if (fn === "employee_access_disable_terminated" && opts.refuse?.[String(args.p_app_user_id)]) {
        return { data: null, error: { message: opts.refuse[String(args.p_app_user_id)] } };
      }
      if (fn === "employee_access_disable_terminated") return { data: "disabled", error: null };
      if (fn === "employee_access_record_revocation" && opts.stampFails) return { data: null, error: { message: "boom" } };
      return { data: null, error: null };
    },
    revokeAuth: async (id) => {
      revoked.push(id);
      const r = opts.revoke ?? { ok: true, failed: [] };
      return typeof r === "function" ? r(id) : r;
    },
  };
  const run = (request: Partial<TerminationRequest> = {}) =>
    enforceTerminations(
      { requestedBy: "cron", config: { enabled: true, employeeAllowlist: null, problem: null }, accessMode: "shadow", now: NOW, ...request },
      deps,
    );
  const disables = () => calls.filter((c) => c.fn === "employee_access_disable_terminated");
  const runCall = () => calls.find((c) => c.fn === "employee_access_record_apply_run");
  const recorded = () => (runCall()?.args.p_actions ?? []) as { result: string; result_code: string; app_user_id: string | null }[];
  return { calls, revoked, run, disables, recorded, runCall };
}

describe("the switch: default OFF", () => {
  it("with no switch set, nothing is planned, read, called or revoked", async () => {
    const e = employee();
    const h = harness(healthy([e], [account(e)]));
    expect(await h.run({ config: readTerminationEnforcement({}) })).toEqual({ status: "off" });
    expect(h.calls).toEqual([]);
    expect(h.revoked).toEqual([]);
  });

  it("an invalid switch value is off too", async () => {
    const e = employee();
    const h = harness(healthy([e], [account(e)]));
    expect(await h.run({ config: readTerminationEnforcement({ WOVEN_TERMINATION_ENFORCEMENT: "true" }) })).toEqual({ status: "off" });
    expect(h.calls).toEqual([]);
  });

  it("even switched on, enforcement does nothing unless WOVEN_ACCESS_MODE is shadow, and says why", async () => {
    const e = employee();
    const h = harness(healthy([e], [account(e)]));
    expect(await h.run({ accessMode: "off" })).toEqual({ status: "blocked", code: "shadow_mode_required" });
    expect(h.calls).toEqual([]);
  });
});

describe("a confirmed, unprotected, reviewed, terminated account", () => {
  it("reads the review gate, disables, revokes the auth access, stamps it, then records the run", async () => {
    const e = employee();
    const a = account(e);
    const h = harness(healthy([e], [a]));
    const outcome = await h.run();
    expect(outcome).toMatchObject({ status: "completed", tally: { applied: 1, failed: 0, skipped: 0 }, incompleteAccounts: 0, gate: null });
    expect(h.calls.map((c) => c.fn)).toEqual([
      "employee_access_review_state",
      "employee_access_disable_terminated",
      "employee_access_record_revocation",
      "employee_access_record_apply_run",
    ]);
    expect(h.revoked).toEqual([a.appUserId]);
    expect(h.disables()[0]!.args).toMatchObject({
      p_app_user_id: a.appUserId,
      p_external_employee_id: e.externalEmployeeId,
      p_woven_company_id: PINNED_COMPANY_ID,
      p_review_id: REVIEW_ID,
      p_protected_user_ids: [...APP_SWITCHER_USER_IDS],
    });
    expect(h.runCall()!.args.p_status).toBe("completed");
    expect(h.recorded()).toMatchObject([{ result: "applied", result_code: "disabled.auth_revoked", app_user_id: a.appUserId }]);
  });

  it.each(["location_manager", "assistant_manager", "employee"] as const)("works for the Ask Bubbles role %s", async (role) => {
    const e = employee();
    const h = harness(healthy([e], [account(e, { role })]));
    await h.run();
    expect(h.disables()).toHaveLength(1);
  });

  it("is idempotent: an already-revoked account produces no action, and a second run does nothing", async () => {
    const e = employee();
    const done = account(e, { status: "disabled", accessRevokedAt: "2026-10-18T00:00:00Z", terminatedAt: "2026-10-18T00:00:00Z" });
    const h = harness(healthy([e], [done]));
    expect(await h.run()).toMatchObject({ status: "completed", tally: { applied: 0, failed: 0, skipped: 0 }, accessRunId: null });
    expect(h.calls).toEqual([]);
  });
});

describe("PARTIAL FAILURE is never reported as a completed enforcement", () => {
  it("profile disabled but the auth ban/sessions fail: run is `failed`, one incomplete account, 'completed' is never recorded", async () => {
    const e = employee();
    const h = harness(healthy([e], [account(e)]), { revoke: { ok: false, failed: ["ban"] } });
    const outcome = await h.run();
    expect(outcome).toMatchObject({ status: "failed", tally: { applied: 0, failed: 1 }, incompleteAccounts: 1 });
    expect(h.calls.find((c) => c.fn === "employee_access_record_revocation")!.args).toMatchObject({ p_ok: false });
    expect(h.runCall()!.args.p_status).toBe("failed");
    expect(h.recorded()[0]).toMatchObject({ result: "failed", result_code: "auth_revocation_incomplete.ban" });
  });

  it("auth revoked but the stamp could not be recorded: failed, not applied", async () => {
    const e = employee();
    const h = harness(healthy([e], [account(e)]), { stampFails: true });
    const outcome = await h.run();
    expect(outcome).toMatchObject({ status: "failed", incompleteAccounts: 1 });
    expect(h.recorded()[0]).toMatchObject({ result: "failed", result_code: "revocation_not_recorded" });
  });

  it("one account completes and another does not: the run is `partial`", async () => {
    const [e1, e2] = [employee(), employee()];
    const [a1, a2] = [account(e1), account(e2)];
    const h = harness(healthy([e1, e2], [a1, a2]), { revoke: (id) => (id === a2.appUserId ? { ok: false, failed: ["sessions"] } : { ok: true, failed: [] }) });
    const outcome = await h.run();
    expect(outcome).toMatchObject({ status: "partial", tally: { applied: 1, failed: 1 }, incompleteAccounts: 1 });
    expect(h.runCall()!.args.p_status).toBe("partial");
  });

  it("a thrown error while disabling is recorded failed, not lost", async () => {
    const e = employee();
    const plan = healthy([e], [account(e)]);
    const h = harness(plan);
    const outcome = await enforceTerminations(
      { requestedBy: "cron", config: { enabled: true, employeeAllowlist: null, problem: null }, accessMode: "shadow", now: NOW },
      {
        pinnedCompanyId: PINNED_COMPANY_ID,
        protectedUserIds: APP_SWITCHER_USER_IDS,
        loadPlan: async () => plan,
        rpc: async (fn) => {
          if (fn === "employee_access_review_state") return { data: { ok: true, review_id: REVIEW_ID, approved_employee_ids: [e.externalEmployeeId] }, error: null };
          if (fn === "employee_access_disable_terminated") throw new Error("connection lost");
          return { data: "x", error: null };
        },
        revokeAuth: async () => ({ ok: true, failed: [] }),
      },
    );
    expect(outcome).toMatchObject({ status: "failed", incompleteAccounts: 1 });
    expect(h.calls).toEqual([]);
  });

  it("the retry next run (account disabled, revocation not yet recorded) completes WITHOUT a new review, even with the gate closed", async () => {
    const e = employee();
    const half = account(e, { status: "disabled", terminatedAt: "2026-10-18T00:00:00Z", accessRevokedAt: null });
    const h = harness(healthy([e], [half]), { gate: { ok: false, code: "review_outdated" } });
    const outcome = await h.run();
    expect(outcome).toMatchObject({ status: "completed", tally: { applied: 1, failed: 0, skipped: 0 }, gate: null });
    expect(h.revoked).toEqual([half.appUserId]);
    expect(h.disables()[0]!.args.p_review_id).toBeNull();
  });
});

describe("unlinked and unconfirmed accounts are never touched", () => {
  it("an account matching a terminated employee ONLY by email is not disabled", async () => {
    const e = employee();
    const h = harness(healthy([e], [account(null, { email: e.emailAddress! })]));
    const outcome = await h.run();
    expect(h.disables()).toEqual([]);
    expect(h.revoked).toEqual([]);
    expect(outcome).toMatchObject({ status: "completed", tally: { applied: 0, failed: 0, skipped: 0 } });
  });

  it("an account whose name matches but whose link names a different EmployeeID is not disabled", async () => {
    const e = employee({ name: "Same Name" });
    const other = employee({ name: "Same Name", employmentStatus: "active", terminationDate: null });
    const h = harness(healthy([e, other], [account(other, { displayName: "Same Name" })]));
    await h.run();
    expect(h.disables()).toEqual([]);
  });

  it("a not_woven_managed account and a link whose status Woven does not manage are never disabled", async () => {
    const e1 = employee();
    const e2 = employee();
    const h = harness(healthy([e1, e2], [account(null, { email: e1.emailAddress!, management: "not_woven_managed" }), account(e2, { managedStatus: false })]));
    await h.run();
    expect(h.disables()).toEqual([]);
  });
});

describe("PROTECTED accounts are review-only, in the planner, the apply step and the database", () => {
  const sw = APP_SWITCHER_USER_IDS[0]!;
  const cases: { label: string; over: Partial<PlannerAccount> }[] = [
    { label: "admin", over: { role: "admin", scopeLevel: "global", primaryAreaId: null } },
    { label: "owner", over: { role: "owner", scopeLevel: "global", primaryAreaId: null } },
    { label: "developer", over: { role: "developer", scopeLevel: "global", primaryAreaId: null } },
    { label: "district_manager", over: { role: "district_manager", scopeLevel: "district", primaryAreaId: "dist-1" } },
    { label: "regional_manager", over: { role: "regional_manager", scopeLevel: "region", primaryAreaId: "reg-1" } },
    { label: "an app-switcher user id", over: { appUserId: sw } },
    { label: "a role override", over: { override: { role: "location_manager", scopeLevel: "location", externalEmployeeId: null } } },
  ];

  it.each(cases)("$label is never disabled and never revoked", async ({ over }) => {
    const e = employee();
    const h = harness(healthy([e], [account(e, over)]));
    const outcome = await h.run();
    expect(h.disables()).toEqual([]);
    expect(h.revoked).toEqual([]);
    expect(outcome).toMatchObject({ status: "completed", tally: { applied: 0, failed: 0 } });
  });

  it("the planner shows FLAG_PROTECTED_ACCOUNT, so shadow runs never list them for review approval", () => {
    for (const { over } of cases) {
      const e = employee();
      const plan = healthy([e], [account(e, over)]);
      const row = plan.rows.find((r) => r.externalEmployeeId === e.externalEmployeeId)!;
      expect(row.actions).toEqual(["FLAG_PROTECTED_ACCOUNT"]);
    }
  });

  it("if a protected row ever reached the apply step it is skipped protected_account (belt and braces)", async () => {
    const e = employee();
    const a = account(e, { role: "district_manager", scopeLevel: "district" });
    const plan = healthy([e], [a]);
    const forced: AccessPlan = {
      ...plan,
      rows: plan.rows.map((r) => (r.account?.appUserId === a.appUserId ? { ...r, actions: ["DISABLE_TERMINATED"] } : r)),
    };
    const h = harness(forced);
    const outcome = await h.run();
    expect(h.disables()).toEqual([]);
    expect(outcome).toMatchObject({ tally: { applied: 0, skipped: 1 } });
    expect(h.recorded()[0]).toMatchObject({ result: "skipped", result_code: "protected_account" });
  });

  it("the account of the person who triggered the run is skipped", async () => {
    const e = employee();
    const a = account(e);
    const h = harness(healthy([e], [a]));
    const outcome = await h.run({ actingUserId: a.appUserId });
    expect(h.disables()).toEqual([]);
    expect(outcome).toMatchObject({ tally: { applied: 0, skipped: 1 } });
    expect(h.recorded()[0]).toMatchObject({ result: "skipped", result_code: "acting_account" });
  });

  it("the database's own protected refusal is recorded failed, nothing revoked at the auth layer", async () => {
    const e = employee();
    const a = account(e);
    const h = harness(healthy([e], [a]), { refuse: { [a.appUserId]: "disable_protected_account" } });
    const outcome = await h.run();
    expect(h.revoked).toEqual([]);
    expect(outcome).toMatchObject({ status: "failed", incompleteAccounts: 1 });
    expect(h.recorded()[0]).toMatchObject({ result: "failed", result_code: "disable_protected_account" });
  });

  const SQL = readFileSync(join(__dirname, "../../../../../supabase/migrations/20261019001000_woven_disable_terminated_apply.sql"), "utf8").replace(/--.*$/gm, "");

  it("the SQL's protected role list equals the TypeScript one (admin roles + district/regional)", () => {
    const fn = SQL.slice(SQL.indexOf("create or replace function public.employee_access_is_protected"));
    const roles = [...(fn.match(/u\.role::text in \(([^)]*)\)/)![1]!.matchAll(/'([a-z_]+)'/g))].map((m) => m[1]).sort();
    expect(roles).toEqual([...ADMIN_CONSOLE_ROLES, ...WOVEN_TERMINATION_PROTECTED_ROLES].sort());
  });

  it("the app-switcher grant list is the one the server hands to the database", () => {
    expect(APP_SWITCHER_USER_IDS.length).toBeGreaterThan(0);
    expect(WOVEN_TERMINATION_PROTECTED_ROLES).toEqual(["district_manager", "regional_manager"]);
  });
});

describe("THE SHADOW-REVIEW GATE", () => {
  it.each(["no_shadow_run", "shadow_run_guard_tripped", "shadow_run_stale", "no_review", "review_outdated", "reviewer_not_admin"])(
    "gate %s: nothing is disabled, the candidate is recorded skipped, and the response says why",
    async (code) => {
      const e = employee();
      const h = harness(healthy([e], [account(e)]), { gate: { ok: false, code } });
      const outcome = await h.run();
      expect(h.disables()).toEqual([]);
      expect(h.revoked).toEqual([]);
      expect(outcome).toMatchObject({ status: "completed", gate: code, tally: { applied: 0, skipped: 1 } });
      expect(h.recorded()[0]).toMatchObject({ result: "skipped", result_code: `review_${code}` });
    },
  );

  it("an unreadable gate is a closed gate", async () => {
    for (const gate of ["error", "throw"] as const) {
      const e = employee();
      const h = harness(healthy([e], [account(e)]), { gate });
      const outcome = await h.run();
      expect(h.disables()).toEqual([]);
      expect(outcome).toMatchObject({ gate: "review_state_unavailable" });
    }
  });

  it("an employee who is not on the administrator's approved list is skipped; the approved one is disabled", async () => {
    const [e1, e2] = [employee(), employee()];
    const h = harness(healthy([e1, e2], [account(e1), account(e2)]), { approve: [e1.externalEmployeeId] });
    const outcome = await h.run();
    expect(h.disables().map((c) => c.args.p_external_employee_id)).toEqual([e1.externalEmployeeId]);
    expect(outcome).toMatchObject({ tally: { applied: 1, skipped: 1 }, gate: "ok" });
    expect(h.recorded().find((r) => r.result === "skipped")!.result_code).toBe("not_in_reviewed_list");
  });

  it("a review whose list is empty approves nothing", async () => {
    const e = employee();
    const h = harness(healthy([e], [account(e)]), { approve: [] });
    await h.run();
    expect(h.disables()).toEqual([]);
  });

  it("the gate is read only when there is something to disable", async () => {
    const e = employee({ employmentStatus: "active", terminationDate: null });
    const h = harness(healthy([e], [account(e)]));
    await h.run();
    expect(h.calls.map((c) => c.fn)).not.toContain("employee_access_review_state");
  });
});

describe("STALE Woven data stops everything (mass-change guards)", () => {
  it("a stale directory sync applies nothing and records every disable as skipped guard_blocked", async () => {
    const e = employee();
    const stale = [{ ...HEALTHY_RUN, finishedAt: "2026-10-10T00:00:00Z" }];
    const h = harness(healthy([e], [account(e)], stale));
    const outcome = await h.run();
    expect(outcome).toMatchObject({ status: "aborted", guardCodes: expect.arrayContaining(["directory_sync_stale"]) });
    expect(h.disables()).toEqual([]);
    expect(h.revoked).toEqual([]);
    expect(h.recorded()).toMatchObject([{ result: "skipped", result_code: "guard_blocked" }]);
    expect(h.runCall()!.args).toMatchObject({ p_status: "aborted", p_guard_codes: expect.arrayContaining(["directory_sync_stale"]) });
  });

  it("a failed latest directory sync applies nothing", async () => {
    const e = employee();
    const failed = [{ status: "failed" as const, finishedAt: "2026-10-19T11:50:00Z", employeesActive: 0, issueCounts: {} }, HEALTHY_RUN];
    const h = harness(healthy([e], [account(e)], failed));
    expect(await h.run()).toMatchObject({ status: "aborted", guardCodes: expect.arrayContaining(["latest_directory_run_not_successful"]) });
    expect(h.disables()).toEqual([]);
  });

  it("a wave of terminations beyond the threshold applies nothing", async () => {
    const wave = Array.from({ length: 6 }, () => employee());
    const h = harness(healthy(wave, wave.map((e) => account(e))));
    expect(await h.run()).toMatchObject({ status: "aborted", guardCodes: expect.arrayContaining(["terminations_exceed_threshold"]) });
    expect(h.disables()).toEqual([]);
  });
});

describe("TENANT isolation (company scope)", () => {
  it("the pinned id handed to the database is the Midwest Soap Makers id, and only that", () => {
    expect(PINNED_COMPANY_ID).toBe("55839f24-9241-418c-8405-37baf9a42a87");
    expect(PINNED_COMPANY_ID).toBe(WOVEN_TENANT.companyId.toLowerCase());
    expect(WOVEN_TENANT.companyName).toBe("Midwest Soap Makers");
  });

  it("a database company refusal is recorded failed and revokes nothing", async () => {
    const e = employee();
    const a = account(e);
    const h = harness(healthy([e], [a]), { refuse: { [a.appUserId]: "disable_company_scope" } });
    const outcome = await h.run();
    expect(h.disables()[0]!.args.p_woven_company_id).toBe(PINNED_COMPANY_ID);
    expect(h.revoked).toEqual([]);
    expect(outcome).toMatchObject({ status: "failed", incompleteAccounts: 1 });
    expect(h.recorded()[0]).toMatchObject({ result: "failed", result_code: "disable_company_scope" });
  });

  const SQL = readFileSync(join(__dirname, "../../../../../supabase/migrations/20261019001000_woven_disable_terminated_apply.sql"), "utf8").replace(/--.*$/gm, "");

  it("every company literal in the SQL is the pinned company; disable, rehire and review all check the directory row and the latest run", () => {
    const ids = [...SQL.matchAll(/'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/gi)].map((m) => m[1]!.toLowerCase());
    expect(ids.length).toBeGreaterThanOrEqual(5);
    expect(new Set(ids)).toEqual(new Set([PINNED_COMPANY_ID]));
    for (const fn of ["employee_access_disable_terminated", "employee_access_approve_rehire", "employee_access_record_shadow_review"]) {
      const start = SQL.indexOf(`create or replace function public.${fn}`);
      const body = SQL.slice(start, SQL.indexOf("$$;", SQL.indexOf("as $$", start)));
      expect(body, fn).toMatch(/p_woven_company_id is distinct from v_pinned/);
      expect(body, fn).toMatch(/_company_scope/);
      expect(body, fn).toMatch(/employee_access_directory_is_current|woven_company_id = v_pinned/);
    }
    expect(SQL).toMatch(/r\.woven_company_id = '55839f24-9241-418c-8405-37baf9a42a87'::uuid/);
  });

  it("the SQL refuses unconfirmed or unapproved links, unmanaged status and unreviewed employees, and checks Terminated in the latest read", () => {
    const start = SQL.indexOf("create or replace function public.employee_access_disable_terminated");
    const body = SQL.slice(start, SQL.indexOf("$$;", SQL.indexOf("as $$", start)));
    for (const code of [
      "disable_not_linked", "disable_link_not_confirmed", "disable_link_not_approved", "disable_status_not_managed", "disable_protected_account",
      "disable_protected_ids_required", "disable_directory_not_current", "disable_not_terminated_in_latest_read", "disable_not_in_reviewed_list",
    ]) {
      expect(body, code).toContain(code);
    }
    expect(body).toMatch(/link_method not in \('admin_confirmed_email', 'admin_manual'\)/);
    expect(body).not.toMatch(/'override_backfill'|'unmatched_backfill'|'provisioned'|email_discovery/);
    expect(body).toMatch(/set_by like 'migration:%'/);
  });
});

describe("a controlled first batch", () => {
  it("with an allowlist, only the named EmployeeIDs are disabled; the rest are recorded skipped", async () => {
    const [a1, a2] = [employee(), employee()];
    const h = harness(healthy([a1, a2], [account(a1), account(a2)]));
    const outcome = await h.run({ config: { enabled: true, employeeAllowlist: [a1.externalEmployeeId], problem: null } });
    expect(outcome).toMatchObject({ tally: { applied: 1, skipped: 1 } });
    expect(h.disables().map((c) => c.args.p_external_employee_id)).toEqual([a1.externalEmployeeId]);
    expect(h.recorded().find((r) => r.result === "skipped")!.result_code).toBe("not_in_approved_batch");
  });
});

describe("what it can and cannot call — and it NEVER restores access", () => {
  it("only the four enforcement functions are ever called; never a rehire or a re-enable", async () => {
    const e = employee();
    const h = harness(healthy([e], [account(e)]));
    await h.run();
    expect(new Set(h.calls.map((c) => c.fn))).toEqual(
      new Set(["employee_access_review_state", "employee_access_disable_terminated", "employee_access_record_revocation", "employee_access_record_apply_run"]),
    );
  });

  it("no enforcement, shadow or cron source can restore access: none imports rehire, names restoreAuthAccess, or writes an active status", () => {
    const root = join(__dirname, "../../../../..");
    const files = [
      "src/lib/employees/woven/access/terminate.ts",
      "src/lib/employees/woven/access/termination-run.ts",
      "src/lib/employees/woven/access/termination-config.ts",
      "src/lib/employees/woven/access/shadow.ts",
      "src/lib/employees/woven/access/load.ts",
      "src/app/api/employees/woven/cron/route.ts",
    ];
    for (const file of files) {
      const code = readFileSync(join(root, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(code, file).not.toMatch(/restoreAuth|rehire|approve_rehire|record_rehire/i);
      expect(code, file).not.toMatch(/status:\s*["']active["']/);
    }
  });

  it("refusal codes: only short codes pass through", () => {
    expect(refusalCode({ message: "disable_protected_account" }, "x")).toBe("disable_protected_account");
    expect(refusalCode({ message: "A long human sentence with spaces." }, "fallback")).toBe("fallback");
    expect(refusalCode(null, "fallback")).toBe("fallback");
  });
});
