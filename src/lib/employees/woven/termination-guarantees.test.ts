import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ============================================================================
 * TERMINATION ENFORCEMENT IS THE ONE APPLY PATH — default off, reviewed,
 * bounded, and it never restores access
 * ============================================================================
 *
 * Section 9 of `phase-one-guarantees.test.ts` (kept there until the first
 * review round) moved here when it grew. The access planner of that file's
 * section 8 stays apply-free and WOVEN_ACCESS_MODE still has no apply value.
 * What `phase-one-guarantees.test.ts` was DELIBERATELY changed to allow:
 *   - seven database functions in its RPC list: the enforcement trio, the
 *     shadow-review gate read and write, and the administrator's rehire pair;
 *   - `revokeAuthAccess` named by access/termination-run.ts only, and
 *     `restoreAuthAccess` by access/rehire-run.ts only.
 * Nothing else there was loosened. This file pins what those paths may and
 * may not do, against the SQL and the sources.
 */

const repo = join(__dirname, "..", "..", "..", "..");
const SQL = readFileSync(join(repo, "supabase/migrations/20261019001000_woven_disable_terminated_apply.sql"), "utf8");
const code = SQL.replace(/--.*$/gm, "");
const accessDir = join(repo, "src/lib/employees/woven/access");
const read = (name: string) => readFileSync(join(accessDir, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const fnBody = (name: string) => {
  const start = code.indexOf(`create or replace function public.${name}`);
  return code.slice(start, code.indexOf("$$;", code.indexOf("as $$", start)));
};

describe("the migration", () => {
  it("is a NEW file, later than every earlier one, and says it is not applied", () => {
    const names = readdirSync(join(repo, "supabase/migrations")).sort();
    expect(names[names.length - 1]).toBe("20261019001000_woven_disable_terminated_apply.sql");
    expect(SQL).toMatch(/NOT APPLIED/);
  });

  it("only ever updates app_users to `disabled`, or to `active` inside approve_rehire (an administrator's approval); never touches auth, roles or scope, never deletes", () => {
    const updates = [...code.matchAll(/\bupdate\s+public\.([a-z_]+)\s+set\s+([a-z_]+)/gi)].map((m) => `${m[1]}.${m[2]}`);
    expect([...new Set(updates)].sort()).toEqual([
      "app_users.status",
      "employee_account_links.access_revoked_at",
      "employee_account_links.last_synced_at",
      "employee_account_links.reactivated_at",
      "employee_account_links.terminated_at",
    ]);
    expect(code).not.toMatch(/\b(delete\s+from|truncate|drop\s+table|drop\s+function)\b/i);
    expect(code).not.toMatch(/\bauth\./i);
    expect(code).not.toMatch(/set\s+(role|scope_|email|display_name)/i);
    for (const name of [
      "employee_access_disable_terminated",
      "employee_access_record_revocation",
      "employee_access_record_apply_run",
      "employee_access_record_shadow_review",
      "employee_access_review_state",
      "employee_access_record_rehire",
    ]) {
      expect(fnBody(name), name).not.toMatch(/set status = 'active'/);
    }
    expect(fnBody("employee_access_approve_rehire")).toMatch(/set status = 'active', updated_by = p_approver/);
    expect(code.match(/set status = 'active'/g)).toHaveLength(1);
  });

  it("revokes every function from everyone including service_role, then grants EXECUTE to service_role for the entry points; the only table grant is SELECT, INSERT on the append-only review table", () => {
    expect(code).toMatch(/revoke all on function %s from public, anon, authenticated, service_role/);
    const grants = [...code.matchAll(/grant ([a-z, ]+) on (?:function )?public\.([a-z_]+)[^;]* to ([a-z_, ]+);/g)].map((m) => `${m[2]}:${m[1]}:${m[3]}`);
    expect(grants.sort()).toEqual([
      "employee_access_approve_rehire:execute:service_role",
      "employee_access_disable_terminated:execute:service_role",
      "employee_access_record_apply_run:execute:service_role",
      "employee_access_record_rehire:execute:service_role",
      "employee_access_record_revocation:execute:service_role",
      "employee_access_record_shadow_review:execute:service_role",
      "employee_access_review_state:execute:service_role",
      "employee_access_shadow_reviews:select, insert:service_role",
    ]);
    expect(code).not.toMatch(/grant [^;]*(update|delete|truncate|all)[^;]* to/i);
    expect(code).toMatch(/revoke all on public\.employee_access_shadow_reviews from public, anon, authenticated, service_role;/);
    expect(code).toMatch(/alter table public\.employee_access_shadow_reviews force row level security;/);
    for (const name of ["disable_terminated", "record_revocation", "record_apply_run", "record_shadow_review", "approve_rehire", "record_rehire", "review_state"]) {
      const at = code.indexOf(`create or replace function public.employee_access_${name}`);
      expect(code.slice(at, at + 900), name).toMatch(/security definer\s+set search_path = ''/);
    }
  });

  it("widens the audit vocabulary by exactly woven_rehire_approved (every earlier action kept)", () => {
    const list = (text: string) => {
      const at = text.lastIndexOf("add constraint app_user_audit_action_check");
      const block = text.slice(at).match(/check\s*\(\s*action\s+in\s*\(([\s\S]*?)\)\s*\)/)!;
      return [...block[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!).sort();
    };
    const before = list(readFileSync(join(repo, "supabase/migrations/20261002001000_auth_revocation_hardening.sql"), "utf8"));
    expect(list(SQL)).toEqual([...before, "woven_rehire_approved"].sort());
  });
});

describe("the code paths", () => {
  it("the switch module reads one variable and fails closed; the access mode type is unchanged", () => {
    expect(read("termination-config.ts")).toMatch(/raw !== "on"/);
    expect(readFileSync(join(accessDir, "config.ts"), "utf8")).toMatch(/export type WovenAccessMode = "off" \| "shadow";/);
  });

  it("the orchestrator calls only the four enforcement functions, writes no table, and never re-enables", () => {
    const c = read("terminate.ts");
    const rpcs = [...c.matchAll(/rpc\(\s*["'`]([a-z_]+)["'`]/g)].map((m) => m[1]);
    expect([...new Set(rpcs)].sort()).toEqual([
      "employee_access_disable_terminated",
      "employee_access_record_apply_run",
      "employee_access_record_revocation",
      "employee_access_review_state",
    ]);
    expect(c).not.toMatch(/\.from\(|\.auth\s*\.|restoreAuth|rehire|status:\s*["']active["']/i);
  });

  it("enforcement requires the shadow mode and the administrator's review (the gate is read inside the orchestrator)", () => {
    const c = read("terminate.ts");
    expect(c).toMatch(/request\.accessMode !== "shadow"\) return \{ status: "blocked", code: "shadow_mode_required" \}/);
    expect(c).toMatch(/const gate = candidates\.length > 0 \? await readGate\(deps\)/);
    expect(c).toMatch(/not_in_reviewed_list/);
    expect(read("termination-run.ts")).toMatch(/accessMode: readWovenAccessMode\(\)\.mode/);
  });

  it("REHIRE is reachable from exactly one place: the administrator-only route. No cron, enforcement, shadow, sync or planner code imports it", () => {
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && /access\/rehire(-run)?["']|\.\/rehire(-run)?["']/.test(readFileSync(path, "utf8"))) {
          importers.push(path.replace(repo + "/", ""));
        }
      }
    };
    walk(join(repo, "src"));
    expect(importers.sort()).toEqual(["src/app/api/admin/employees/woven/rehire/route.ts", "src/lib/employees/woven/access/rehire-run.ts"]);

    const rpcs = [...read("rehire.ts").matchAll(/rpc\(\s*["'`]([a-z_]+)["'`]/g)].map((m) => m[1]);
    expect([...new Set(rpcs)].sort()).toEqual(["employee_access_approve_rehire", "employee_access_record_rehire"]);

    const route = readFileSync(join(repo, "src/app/api/admin/employees/woven/rehire/route.ts"), "utf8");
    expect(route).toMatch(/authorizeWovenAdminDecision\(request\)/);
    expect(route).toMatch(/context\.identity\.subject/);
    const guard = readFileSync(join(repo, "src/lib/employees/woven/route-auth.ts"), "utf8");
    expect(guard).toMatch(/assertSameOrigin\(request\)/);
    expect(guard).toMatch(/canAccessAdminConsole\(context\.identity\.role\)/);
    expect(guard).toMatch(/assertWithinRateLimit\(request, "mutate"\)/);
  });

  it("the cron route runs enforcement only through the switch-guarded wiring, after a successful sync and BEFORE it records its own shadow run, and answers 500 for an incomplete enforcement", () => {
    const route = readFileSync(join(repo, "src/app/api/employees/woven/cron/route.ts"), "utf8");
    expect(route).toMatch(/outcome\.status === "succeeded" \? await runTerminationEnforcement\(CRON_REQUESTER\)/);
    expect(route.indexOf("await runTerminationEnforcement(")).toBeLessThan(route.indexOf("await recordAccessShadowRun("));
    expect(route).toMatch(/termination\.status === "partial" \|\| termination\.status === "failed"/);
    expect(route).toMatch(/enforcementIncomplete \? 500/);
    expect(readFileSync(join(accessDir, "termination-run.ts"), "utf8")).toMatch(/if \(!config\.enabled\) return \{ status: "off" \};/);
  });
});
