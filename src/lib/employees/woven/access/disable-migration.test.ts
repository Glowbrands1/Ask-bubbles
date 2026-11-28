import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { WOVEN_AUTO_PROVISION_ROLES } from "@/config/company/woven";
import { ADMIN_CONSOLE_ROLES } from "@/lib/permissions";

/**
 * ============================================================================
 * 20261128001000_woven_disable_terminated.sql — what the apply step's
 * database half may and may not do (read from the SQL, no database needed)
 * ============================================================================
 *
 * Its behaviour on real Postgres (refusals, the email-match link, idempotency,
 * the run lock, privileges) was exercised on a scratch Postgres 16 with this
 * app's employee-sync migrations; these assertions keep its shape from
 * drifting.
 */

const SQL = readFileSync("supabase/migrations/20261128001000_woven_disable_terminated.sql", "utf8");
const code = SQL.replace(/--.*$/gm, "");
const fnBody = (name: string) => {
  const from = code.indexOf(`create or replace function public.${name}(`);
  expect(from, name).toBeGreaterThan(-1);
  const body = code.slice(from);
  return body.slice(0, body.indexOf("$$;"));
};
const sqlList = (text: string) => [...text.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!).sort();

describe("the disable-terminated migration", () => {
  it("every function has an empty search_path; every entry point is SECURITY DEFINER and executable by service_role only", () => {
    const fns = [...code.matchAll(/create or replace function public\.([a-z_]+)\([\s\S]*?\$\$/g)];
    expect(fns.length).toBe(9);
    for (const m of fns) expect(m[0], m[1]).toMatch(/set search_path = ''/);
    const entry = [
      "employee_access_begin_apply_run",
      "employee_access_disable_terminated",
      "employee_access_finish_apply_run",
      "employee_access_record_apply_actions",
      "employee_access_record_revocation",
    ];
    for (const name of entry) expect(fns.find((m) => m[1] === name)?.[0], name).toMatch(/security definer/);
    for (const m of fns) expect(code, m[1]).toMatch(new RegExp(`'public\\.${m[1]}\\([^']*\\)'`));
    expect(code).toMatch(/revoke all on function %s from public, anon, authenticated, service_role/);
    const grants = [...code.matchAll(/grant ([a-z, ]+) on (?:function )?public\.([a-z_]+)[^;]* to ([a-z_, ]+);/g)].map((m) => `${m[2]}:${m[1]}:${m[3]}`);
    expect(grants.sort()).toEqual(entry.map((e) => `${e}:execute:service_role`).sort());
    expect(code).not.toMatch(/grant [^;]*(update|delete|truncate|all)[^;]* to/i);
  });

  it("deletes nothing, never writes auth, never writes a role, scope or location", () => {
    expect(code).not.toMatch(/delete\s+from|truncate/i);
    expect(code).not.toMatch(/(insert into|update)\s+auth\./i);
    expect(code).not.toMatch(/\bauth\./);
    const disable = fnBody("employee_access_disable_terminated");
    expect(disable).toMatch(/update public\.app_users set status = 'disabled', updated_by = null where id = p_app_user_id/);
    /* The only UPDATE of app_users sets status; nothing SETs a role, a scope or a location. */
    expect(code).not.toMatch(/\bset\s[^;]*\b(role|scope_level|scope_primary_area_id|scope_also_covers_area_ids)\s*=/i);
    expect([...code.matchAll(/update public\.app_users/g)]).toHaveLength(1);
  });

  it("disables only on Woven's Terminated in the latest read of a current directory, never a protected account", () => {
    const disable = fnBody("employee_access_disable_terminated");
    expect(disable).toMatch(/if not public\.employee_access_directory_is_current\(\) then\s+raise exception 'disable_directory_not_current'/);
    expect(disable).toMatch(/employee_access_observed_status\(p_external_employee_id\) <> 'terminated' then\s+raise exception 'disable_not_terminated_in_latest_read'/);
    expect(disable).toMatch(/if public\.employee_access_is_protected\(p_app_user_id\) then\s+raise exception 'disable_protected_account'/);
    /* A linked account: same EmployeeID, status managed. */
    expect(disable).toMatch(/v_link\.external_employee_id is distinct from p_external_employee_id/);
    expect(disable).toMatch(/if not v_link\.managed_status then\s+raise exception 'disable_status_not_managed'/);
    /* not_woven_managed is a link row too: it can never reach the email path. */
    expect(disable).toMatch(/if v_link\.management <> 'woven_linked'/);
  });

  it("the email path: exact case-insensitive match, one Woven holder, one account, and the link is stored with role and location NOT managed", () => {
    const disable = fnBody("employee_access_disable_terminated");
    expect(disable).toMatch(/lower\(btrim\(coalesce\(v_dir\.email_address, ''\)\)\) <> v_email/);
    expect(disable).toMatch(/from public\.employee_access_directory d where lower\(btrim\(d\.email_address\)\) = v_email\) <> 1/);
    expect(disable).toMatch(/from public\.app_users u where lower\(btrim\(u\.email\)\) = v_email\) <> 1/);
    expect(disable).toMatch(/'termination_email_match',\s+true, false, false/);
    expect(code).not.toMatch(/managed_(role|location)\s*=\s*true/);
  });

  it("the roles Woven may disable by email match are WOVEN_AUTO_PROVISION_ROLES, at location scope; protected roles are ADMIN_CONSOLE_ROLES", () => {
    const disable = fnBody("employee_access_disable_terminated");
    const accountRoles = disable.match(/v_user\.role in \(([^)]*)\)/)![1]!;
    const wovenRoles = disable.match(/v_mapped in \(([^)]*)\)/)![1]!;
    expect(sqlList(accountRoles)).toEqual([...WOVEN_AUTO_PROVISION_ROLES].sort());
    expect(sqlList(wovenRoles)).toEqual([...WOVEN_AUTO_PROVISION_ROLES].sort());
    expect(disable).toMatch(/v_user\.scope_level = 'location'/);
    const protectedRoles = fnBody("employee_access_is_protected").match(/u\.role::text in \(([^)]*)\)/)![1]!;
    expect(sqlList(protectedRoles)).toEqual([...ADMIN_CONSOLE_ROLES].sort());
  });

  it("an apply run records no shadow result, and a shadow run is final when written", () => {
    expect(fnBody("employee_access_record_apply_actions")).toMatch(/an apply run records no shadow results/);
    expect(code).toMatch(/check \(mode = 'apply' or status in \('completed', 'aborted'\)\)/);
    expect(code).toMatch(/create unique index if not exists employee_access_runs_one_running\s+on public\.employee_access_runs \(mode\) where status = 'running'/);
  });
});
