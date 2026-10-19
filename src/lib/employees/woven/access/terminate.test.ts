import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WOVEN_TENANT } from "@/config/company/woven";

import { PINNED_COMPANY_ID } from "../config";
import { buildAccessPlan, type AccessPlan } from "./build";
import { enforceTerminations, refusalCode, type RpcResult, type TerminationDeps, type TerminationRequest } from "./terminate";
import { readTerminationEnforcement } from "./termination-config";
import type { PlannerAccount, PlannerEmployee, PlannerInput } from "./types";

/**
 * ============================================================================
 * TERMINATION ENFORCEMENT, CASE BY CASE — pure orchestration, fake effects
 * ============================================================================
 */

const NOW = new Date("2026-10-19T12:00:00Z");

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

/** One active bystander keeps the "zero active employees" guard quiet; plenty of managed accounts keep the threshold at its floor. */
function healthy(employees: PlannerEmployee[], accounts: PlannerAccount[], runs = [{ status: "succeeded" as const, finishedAt: "2026-10-19T11:18:00Z", employeesActive: 50, issueCounts: {} }]): AccessPlan {
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

function harness(plan: AccessPlan, opts: { refuse?: Record<string, string>; revoke?: { ok: boolean; failed: string[] } } = {}) {
  const calls: Call[] = [];
  const revoked: string[] = [];
  const deps: TerminationDeps = {
    pinnedCompanyId: PINNED_COMPANY_ID,
    loadPlan: async () => plan,
    rpc: async (fn, args): Promise<RpcResult> => {
      calls.push({ fn, args });
      if (fn === "employee_access_record_apply_run") return { data: "22222222-2222-4222-8222-222222222222", error: null };
      if (fn === "employee_access_disable_terminated" && opts.refuse?.[String(args.p_app_user_id)]) {
        return { data: null, error: { message: opts.refuse[String(args.p_app_user_id)] } };
      }
      if (fn === "employee_access_disable_terminated") return { data: "disabled", error: null };
      return { data: null, error: null };
    },
    revokeAuth: async (id) => {
      revoked.push(id);
      return opts.revoke ?? { ok: true, failed: [] };
    },
  };
  const run = (request: Partial<TerminationRequest> = {}) =>
    enforceTerminations({ requestedBy: "cron", config: { enabled: true, employeeAllowlist: null, problem: null }, now: NOW, ...request }, deps);
  const disables = () => calls.filter((c) => c.fn === "employee_access_disable_terminated");
  const recorded = () => (calls.find((c) => c.fn === "employee_access_record_apply_run")?.args.p_actions ?? []) as { result: string; result_code: string; app_user_id: string | null }[];
  return { calls, revoked, run, disables, recorded };
}

describe("the switch: default OFF", () => {
  it("with no switch set, nothing is planned, read, called or revoked", async () => {
    const e = employee();
    const h = harness(healthy([e], [account(e)]));
    const outcome = await h.run({ config: readTerminationEnforcement({}) });
    expect(outcome).toEqual({ status: "off" });
    expect(h.calls).toEqual([]);
    expect(h.revoked).toEqual([]);
  });

  it("an invalid switch value is off too", async () => {
    const e = employee();
    const h = harness(healthy([e], [account(e)]));
    expect(await h.run({ config: readTerminationEnforcement({ WOVEN_TERMINATION_ENFORCEMENT: "true" }) })).toEqual({ status: "off" });
    expect(h.calls).toEqual([]);
  });
});

describe("a confirmed, unprotected, terminated account", () => {
  it("is disabled, then its auth access is revoked, then the revocation is stamped, then the run is recorded", async () => {
    const e = employee();
    const a = account(e);
    const h = harness(healthy([e], [a]));
    const outcome = await h.run();
    expect(outcome).toMatchObject({ status: "completed", tally: { applied: 1, failed: 0, skipped: 0 } });
    expect(h.calls.map((c) => c.fn)).toEqual(["employee_access_disable_terminated", "employee_access_record_revocation", "employee_access_record_apply_run"]);
    expect(h.revoked).toEqual([a.appUserId]);
    expect(h.disables()[0]!.args).toMatchObject({
      p_app_user_id: a.appUserId,
      p_external_employee_id: e.externalEmployeeId,
      p_woven_company_id: PINNED_COMPANY_ID,
    });
    expect(h.recorded()).toMatchObject([{ result: "applied", result_code: "disabled.auth_revoked", app_user_id: a.appUserId }]);
  });

  it.each(["district_manager", "location_manager", "assistant_manager", "employee"] as const)("works for the Ask Bubbles role %s", async (role) => {
    const e = employee();
    const h = harness(healthy([e], [account(e, { role, scopeLevel: role === "district_manager" ? "district" : "location" })]));
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

  it("a half-finished revocation (disabled, not yet revoked) is proposed again and completed", async () => {
    const e = employee();
    const half = account(e, { status: "disabled", terminatedAt: "2026-10-18T00:00:00Z", accessRevokedAt: null });
    const h = harness(healthy([e], [half]));
    expect(await h.run()).toMatchObject({ tally: { applied: 1 } });
    expect(h.revoked).toEqual([half.appUserId]);
  });

  it("an incomplete auth revocation is recorded failed (and stamped incomplete), never applied", async () => {
    const e = employee();
    const h = harness(healthy([e], [account(e)]), { revoke: { ok: false, failed: ["sessions"] } });
    const outcome = await h.run();
    expect(outcome).toMatchObject({ tally: { applied: 0, failed: 1 } });
    expect(h.calls.find((c) => c.fn === "employee_access_record_revocation")!.args).toMatchObject({ p_ok: false });
    expect(h.recorded()[0]).toMatchObject({ result: "failed", result_code: "auth_revocation_incomplete.sessions" });
  });
});

describe("unlinked and unconfirmed accounts are never touched", () => {
  it("an account matching a terminated employee ONLY by email is not disabled", async () => {
    const e = employee();
    const unlinked = account(null, { email: e.emailAddress! });
    const h = harness(healthy([e], [unlinked]));
    const outcome = await h.run();
    expect(h.disables()).toEqual([]);
    expect(h.revoked).toEqual([]);
    expect(outcome).toMatchObject({ status: "completed", tally: { applied: 0, failed: 0, skipped: 0 } });
  });

  it("an account whose name matches but whose link names a different EmployeeID is not disabled", async () => {
    const e = employee({ name: "Same Name" });
    const other = employee({ name: "Same Name", employmentStatus: "active", terminationDate: null });
    const a = account(other, { displayName: "Same Name" });
    const h = harness(healthy([e, other], [a]));
    await h.run();
    expect(h.disables()).toEqual([]);
  });

  it("a not_woven_managed account is never touched", async () => {
    const e = employee();
    const a = account(null, { email: e.emailAddress!, management: "not_woven_managed" });
    const h = harness(healthy([e], [a]));
    await h.run();
    expect(h.disables()).toEqual([]);
  });

  it("a linked account whose status Woven does not manage is held, not disabled", async () => {
    const e = employee();
    const h = harness(healthy([e], [account(e, { managedStatus: false })]));
    await h.run();
    expect(h.disables()).toEqual([]);
  });
});

describe("administrators, protected accounts and the acting account are never touched", () => {
  it.each(["admin", "owner", "developer"] as const)("a linked %s is never disabled, so the last active administrator is unreachable", async (role) => {
    const e = employee();
    const a = account(e, { role, scopeLevel: "global", primaryAreaId: null });
    const h = harness(healthy([e], [a]));
    await h.run();
    expect(h.disables()).toEqual([]);
    expect(h.revoked).toEqual([]);
  });

  it("a protected account (role override) is never disabled", async () => {
    const e = employee();
    const a = account(e, { override: { role: "location_manager", scopeLevel: "location", externalEmployeeId: e.externalEmployeeId } });
    const h = harness(healthy([e], [a]));
    await h.run();
    expect(h.disables()).toEqual([]);
  });

  it("the account of the person who triggered the run is skipped, whatever its role", async () => {
    const e = employee();
    const a = account(e);
    const h = harness(healthy([e], [a]));
    // Force the case the planner would allow: an unprotected account that is also the actor.
    const outcome = await h.run({ actingUserId: a.appUserId });
    expect(h.disables()).toEqual([]);
    expect(outcome).toMatchObject({ tally: { applied: 0, skipped: 1 } });
    expect(h.recorded()[0]).toMatchObject({ result: "skipped", result_code: "acting_account" });
  });

  it("when the database refuses because this is the last active administrator, nothing is revoked at the auth layer", async () => {
    const e = employee();
    const a = account(e);
    const h = harness(healthy([e], [a]), { refuse: { [a.appUserId]: "This is the last active administrator." } });
    const outcome = await h.run();
    expect(h.revoked).toEqual([]);
    expect(outcome).toMatchObject({ tally: { applied: 0, failed: 1 } });
    // A free-text trigger message is not a short code: it is not passed on.
    expect(h.recorded()[0]).toMatchObject({ result: "failed", result_code: "disable_refused" });
  });
});

describe("company scope (tenant guard)", () => {
  it("the pinned id handed to the database is the Midwest Soap Makers id, and only that", () => {
    expect(PINNED_COMPANY_ID).toBe("55839f24-9241-418c-8405-37baf9a42a87");
    expect(PINNED_COMPANY_ID).toBe(WOVEN_TENANT.companyId.toLowerCase());
    expect(WOVEN_TENANT.companyName).toBe("Midwest Soap Makers");
  });

  it("every disable call carries the pinned company; a database company refusal is recorded failed and revokes nothing", async () => {
    const e = employee();
    const a = account(e);
    const h = harness(healthy([e], [a]), { refuse: { [a.appUserId]: "disable_company_scope" } });
    const outcome = await h.run();
    expect(h.disables()[0]!.args.p_woven_company_id).toBe(PINNED_COMPANY_ID);
    expect(h.revoked).toEqual([]);
    expect(outcome).toMatchObject({ tally: { applied: 0, failed: 1 } });
    expect(h.recorded()[0]).toMatchObject({ result: "failed", result_code: "disable_company_scope" });
  });

  const SQL = readFileSync(join(__dirname, "../../../../../supabase/migrations/20261019001000_woven_disable_terminated_apply.sql"), "utf8").replace(/--.*$/gm, "");
  const body = SQL.slice(SQL.indexOf("create or replace function public.employee_access_disable_terminated"), SQL.indexOf("create or replace function public.employee_access_record_revocation"));

  it("the SQL pins the same company in every check, and checks the directory row and the latest sync run", () => {
    const ids = [...SQL.matchAll(/'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/gi)].map((m) => m[1]!.toLowerCase());
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ids)).toEqual(new Set([PINNED_COMPANY_ID]));
    expect(body).toMatch(/p_woven_company_id is distinct from v_pinned/);
    expect(body).toMatch(/d\.woven_company_id = v_pinned/);
    expect(SQL).toMatch(/r\.woven_company_id = '55839f24-9241-418c-8405-37baf9a42a87'::uuid/);
    expect(body).toMatch(/disable_company_scope/);
  });

  it("the SQL refuses unconfirmed links, unmanaged status and protected accounts, and re-checks Terminated in the latest read", () => {
    for (const code of ["disable_not_linked", "disable_link_not_confirmed", "disable_status_not_managed", "disable_protected_account", "disable_directory_not_current", "disable_not_terminated_in_latest_read"]) {
      expect(body, code).toContain(code);
    }
    expect(body).toMatch(/link_method not in \('admin_confirmed_email', 'admin_manual', 'provisioned'\)/);
    expect(body).not.toMatch(/'override_backfill'|'unmatched_backfill'|email_discovery/);
  });
});

describe("the mass-change guards still stop everything", () => {
  it("a stale or failed directory sync applies nothing and records every disable as skipped guard_blocked", async () => {
    const e = employee();
    const a = account(e);
    const stale = [{ status: "succeeded" as const, finishedAt: "2026-10-10T00:00:00Z", employeesActive: 50, issueCounts: {} }];
    const h = harness(healthy([e], [a], stale));
    const outcome = await h.run();
    expect(outcome).toMatchObject({ status: "aborted", guardCodes: expect.arrayContaining(["directory_sync_stale"]) });
    expect(h.disables()).toEqual([]);
    expect(h.revoked).toEqual([]);
    expect(h.recorded()).toMatchObject([{ result: "skipped", result_code: "guard_blocked" }]);
    expect(h.calls.find((c) => c.fn === "employee_access_record_apply_run")!.args.p_guard_codes).toContain("directory_sync_stale");
  });

  it("a wave of terminations beyond the threshold applies nothing", async () => {
    const wave = Array.from({ length: 6 }, () => employee());
    const h = harness(healthy(wave, wave.map((e) => account(e))));
    const outcome = await h.run();
    expect(outcome).toMatchObject({ status: "aborted", guardCodes: expect.arrayContaining(["terminations_exceed_threshold"]) });
    expect(h.disables()).toEqual([]);
  });
});

describe("a controlled first batch", () => {
  it("with an allowlist, only the named EmployeeIDs are disabled; the rest are recorded skipped", async () => {
    const [a1, a2] = [employee(), employee()];
    const accounts = [account(a1), account(a2)];
    const h = harness(healthy([a1, a2], accounts));
    const outcome = await h.run({ config: { enabled: true, employeeAllowlist: [a1.externalEmployeeId], problem: null } });
    expect(outcome).toMatchObject({ tally: { applied: 1, skipped: 1 } });
    expect(h.disables().map((c) => c.args.p_external_employee_id)).toEqual([a1.externalEmployeeId]);
    expect(h.recorded().find((r) => r.result === "skipped")!.result_code).toBe("not_in_approved_batch");
  });
});

describe("what it can and cannot call", () => {
  it("only the three termination functions are ever called, never a re-enable", async () => {
    const e = employee();
    const h = harness(healthy([e], [account(e)]));
    await h.run();
    expect(new Set(h.calls.map((c) => c.fn))).toEqual(
      new Set(["employee_access_disable_terminated", "employee_access_record_revocation", "employee_access_record_apply_run"]),
    );
  });

  it("refusal codes: only short codes pass through", () => {
    expect(refusalCode({ message: "disable_protected_account" }, "x")).toBe("disable_protected_account");
    expect(refusalCode({ message: "A long human sentence with spaces." }, "fallback")).toBe("fallback");
    expect(refusalCode(null, "fallback")).toBe("fallback");
  });
});
