import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WovenClient } from "./client";
import { readWovenConfig } from "./config";
import { statusResolver, parseEnums } from "./enums";
import { MemoryDirectoryStore } from "./memory-store";
import { normalizeEmployee } from "./normalize";
import type { CommitInput } from "./store";
import { runWovenEmployeeSync } from "./sync";
import { createFakeWoven, FAKE_COMPANY_ID, FAKE_CREDENTIALS, FAKE_ENUMS, wovenDetails, wovenEmployee, wovenLocation } from "./test-support";

/**
 * ============================================================================
 * THE PHASE-ONE GUARANTEES, PINNED BEFORE THE FIRST STORED SYNC
 * ============================================================================
 *
 * The second Production dry run found 16 employees Woven calls Active (Status
 * 1) with a past TerminationDate, TerminationType 0, no last day worked and no
 * rehire-shaped hire date. These tests pin what a stored sync does with that
 * shape — and with every termination field populated — end to end through the
 * real sync and client. The SQL side (mappings never overwritten, app_users
 * byte-for-byte unchanged) is `scripts/verify-woven-migration.mjs`.
 */

const CONFIG = readWovenConfig({
  WOVEN_SYNC_ENABLED: "true",
  WOVEN_COMPANY_ID: FAKE_COMPANY_ID,
  WOVEN_SYNC_WRITES_ENABLED: "true",
  WOVEN_SUBSCRIPTION_KEY: FAKE_CREDENTIALS.subscriptionKey,
  WOVEN_USERNAME: FAKE_CREDENTIALS.username,
  WOVEN_PASSWORD: FAKE_CREDENTIALS.password,
});
const NOW = () => new Date("2026-09-29T12:00:00Z");

/** The live EmployeeStatus enum (1 Active, 2 Terminated, 10 Vendor, 100 Active Hidden) plus the fixture's TerminationType. */
const LIVE_ENUMS = [
  { EnumerationName: "EmployeeStatus", PropertyName: "Active", PropertyDisplayName: "Active", PropertyValue: 1 },
  { EnumerationName: "EmployeeStatus", PropertyName: "Terminated", PropertyDisplayName: "Terminated", PropertyValue: 2 },
  { EnumerationName: "EmployeeStatus", PropertyName: "Vendor", PropertyDisplayName: "Vendor", PropertyValue: 10 },
  { EnumerationName: "EmployeeStatus", PropertyName: "ActiveHidden", PropertyDisplayName: "Active Hidden", PropertyValue: 100 },
  ...FAKE_ENUMS.filter((e) => e.EnumerationName !== "EmployeeStatus"),
];

/** A store that records every call and every commit payload. */
class RecordingStore extends MemoryDirectoryStore {
  readonly calls: string[] = [];
  readonly commits: CommitInput[] = [];
  override async claimRun(requestedBy: string) {
    this.calls.push("claimRun");
    return super.claimRun(requestedBy);
  }
  override async loadDirectory() {
    this.calls.push("loadDirectory");
    return super.loadDirectory();
  }
  override async loadLocationMap() {
    this.calls.push("loadLocationMap");
    return super.loadLocationMap();
  }
  override async loadPositionMap() {
    this.calls.push("loadPositionMap");
    return super.loadPositionMap();
  }
  override async commitRun(input: CommitInput) {
    this.calls.push("commitRun");
    this.commits.push(structuredClone(input));
    return super.commitRun(input);
  }
  override async abandonRun(input: Parameters<MemoryDirectoryStore["abandonRun"]>[0]) {
    this.calls.push("abandonRun");
    return super.abandonRun(input);
  }
}

/** The Production conflict shape: Active, past TerminationDate, TerminationType 0, no last day, hired long before. */
const conflict = (id: string) =>
  wovenEmployee(id, { status: 1, hireDate: "2021-04-05T00:00:00", startDate: null, terminationDate: "2024-08-01T00:00:00", terminationType: 0 });
/** Every termination field populated, Status still Active. */
const everyTerminationField = (id: string) =>
  wovenEmployee(id, { status: 1, terminationDate: "2026-09-01T00:00:00", lastDayWorked: "2026-08-31T00:00:00", terminationType: 2 });

function setup(employees: Record<string, unknown>[], details: Record<string, Record<string, unknown>> = {}) {
  const fake = createFakeWoven({
    employees,
    details,
    enums: LIVE_ENUMS,
    locations: [wovenLocation("WL-0306"), wovenLocation("WL-0144")],
    tokenLifetimeSeconds: 3600,
  });
  const store = new RecordingStore();
  const run = () =>
    runWovenEmployeeSync({
      requestedBy: "admin:owner@example.test",
      config: CONFIG,
      store,
      now: NOW,
      client: new WovenClient({ companyId: FAKE_COMPANY_ID, baseUrl: CONFIG.baseUrl, credentials: FAKE_CREDENTIALS, fetch: fake.fetch, sleep: async () => {} }),
    });
  return { fake, store, run };
}

async function stored(run: () => ReturnType<typeof runWovenEmployeeSync>) {
  const outcome = await run();
  if (outcome.status !== "succeeded") throw new Error(`expected success, got ${JSON.stringify(outcome)}`);
  return outcome.summary;
}

describe("1. terminated only when Woven's Status resolves to Terminated", () => {
  const statuses = statusResolver(parseEnums(LIVE_ENUMS));
  const today = "2026-09-29";

  it("resolves only the exact Terminated label to terminated; Vendor, Active Hidden, absent and unlisted are unknown", () => {
    expect(statuses.resolve(1)).toBe("active");
    expect(statuses.resolve(2)).toBe("terminated");
    expect(statuses.resolve(10)).toBe("unknown");
    expect(statuses.resolve(100)).toBe("unknown");
    expect(statuses.resolve(null)).toBe("unknown");
    expect(statuses.resolve(999)).toBe("unknown");
  });

  it("Status 1 with every termination field populated is still active", () => {
    const result = normalizeEmployee(everyTerminationField("2001"), { statuses, today });
    if (!result.ok) throw new Error("rejected");
    expect(result.employee.employmentStatus).toBe("active");
    expect(result.employee.issues).toContain("status_termination_conflict");
  });

  it("Status 2 with no termination fields at all is terminated", () => {
    const result = normalizeEmployee(wovenEmployee("2002", { status: 2 }), { statuses, today });
    if (!result.ok) throw new Error("rejected");
    expect(result.employee.employmentStatus).toBe("terminated");
  });
});

describe("2 and 3. termination fields alone never terminate, and the conflict is stored as Active with its flag", () => {
  it("stores the Production conflict shape as Active, keeps the flag, and records no termination — on two runs", async () => {
    const { store, run } = setup([conflict("3001"), everyTerminationField("3002"), wovenEmployee("3003")]);

    const first = await stored(run);
    expect(first.employeesActive).toBe(3);
    expect(first.employeesTerminated).toBe(0);
    expect(first.issueCounts.status_termination_conflict).toBe(2);
    expect(first.changesByKind.terminated).toBe(0);

    for (const id of ["3001", "3002"]) {
      expect(store.rows.get(id)!.employmentStatus).toBe("active");
      const write = store.commits[0]!.employees.find((w) => w.externalEmployeeId === id)!;
      expect(write.employmentStatus).toBe("active");
      expect(write.issues).toContain("status_termination_conflict");
    }
    expect(store.rows.get("3001")!.terminationTypeCode).toBe(0);
    expect(store.changes.every((c) => c.kind === "new_employee" && c.classification === "initial_load")).toBe(true);

    /* The same read again: nothing recorded, still Active, flag still sent. */
    const second = await stored(run);
    expect(Object.values(second.changesByKind).reduce((a, b) => a + b, 0)).toBe(0);
    expect(store.rows.get("3001")!.employmentStatus).toBe("active");
    expect(store.commits[1]!.employees.find((w) => w.externalEmployeeId === "3001")!.issues).toContain(
      "status_termination_conflict",
    );
    expect(store.changes.filter((c) => c.kind === "terminated")).toHaveLength(0);
  });

  it("an employee already on file who GAINS termination fields while Active records no termination", async () => {
    const employees = [wovenEmployee("3101")];
    const { store, run } = setup(employees);
    await stored(run);

    /* The fake Woven serves this same array, so the next read sees the new record. */
    employees[0] = everyTerminationField("3101");
    const later = await stored(run);
    expect(later.changesByKind.terminated).toBe(0);
    expect(store.rows.get("3101")!.employmentStatus).toBe("active");
    expect(store.changes.filter((c) => c.kind === "terminated")).toHaveLength(0);
  });

  it("only a Status change to Terminated records a termination", async () => {
    const employees = [wovenEmployee("3201")];
    const { store, run } = setup(employees);
    await stored(run);

    employees[0] = wovenEmployee("3201", { status: 2, terminationDate: "2026-09-20T00:00:00" });
    const later = await stored(run);
    expect(later.changesByKind.terminated).toBe(1);
    const change = store.changes.find((c) => c.kind === "terminated")!;
    /* Recorded only: the change itself says no access changed. */
    expect(change.details).toMatchObject({ accessChanged: false });
  });
});

describe("4. a stored sync writes only directory, history and mapping data", () => {
  it("calls nothing but the directory store: claim, three reads, one commit", async () => {
    const { store, run } = setup([conflict("4001"), wovenEmployee("4002", { hasMultipleLocationAccess: true })]);
    await stored(run);
    expect(store.calls).toEqual(["claimRun", "loadDirectory", "loadLocationMap", "loadPositionMap", "commitRun"]);
  });

  it("every Woven request is a GET, apart from the token request", async () => {
    const { fake, run } = setup([conflict("4101")]);
    await stored(run);
    const writes = fake.calls.filter((c) => c.method !== "GET" && !c.path.startsWith("/tokens"));
    expect(writes).toEqual([]);
  });

  it("the directory store has no method that reaches app_users, auth, roles, scope, location access or login state", () => {
    const methods = Object.getOwnPropertyNames(MemoryDirectoryStore.prototype).filter((m) => m !== "constructor");
    /*
     * The Woven LOCATION MAP is mapping data this sync owns (Woven location →
     * roster location, reviewed by a person). These two methods read and seed
     * it; nothing else may even be named after locations, so no method can
     * reach a user's location assignments.
     */
    const WOVEN_LOCATION_MAP_METHODS = ["loadLocationMap", "mapLocation"];
    for (const method of methods) {
      if (WOVEN_LOCATION_MAP_METHODS.includes(method)) continue;
      expect(method).not.toMatch(/user|auth|role|scope|login|access|location|invite|disable/i);
    }
    for (const method of WOVEN_LOCATION_MAP_METHODS) {
      expect(methods).toContain(method);
      expect(method).not.toMatch(/user|auth|role|scope|login|access|invite|disable/i);
    }
  });
});

describe("5 and 6. every location and position stays unmapped until a person reviews it", () => {
  it("queues the catalog, off-catalog affiliation locations and every position as unmapped, with no location", async () => {
    const { store, run } = setup(
      [
        wovenEmployee("5001", { positionId: "POS-A" }),
        wovenEmployee("5002", { positionId: "POS-B", hasMultipleLocationAccess: true }),
        /* PositionName without a PositionID, as in Production. */
        wovenEmployee("5003", { positionId: null, positionName: "Floater" }),
      ],
      /* An affiliation location the catalog does not list, like `Example Location Q`. */
      { "5002": wovenDetails("5002", [{ id: "WL-0306" }, { id: "WL-OFFCAT", name: "Off-catalog location" }]) },
    );
    await stored(run);
    await stored(run);

    expect([...store.locationMap.keys()].sort()).toEqual(["WL-0144", "WL-0306", "WL-OFFCAT"]);
    for (const entry of store.locationMap.values()) {
      expect(entry.status).toBe("unmapped");
      expect(entry.locationId).toBeNull();
    }
    expect([...store.positionMap.keys()].sort()).toEqual(["POS-A", "POS-B"]);
    for (const entry of store.positionMap.values()) {
      expect(entry.status).toBe("unmapped");
      expect(entry.isConfirmed).toBe(false);
    }
    /* No position guessed from the PositionName. */
    expect(store.rows.get("5003")!.positionId).toBeNull();
    expect(store.changes.filter((c) => c.kind === "position_changed")).toHaveLength(0);
  });
});

describe("7. no employee-sync UI, route or library code can reach app_users, auth, roles, scope or location access", () => {
  const ROOTS = [
    "src/lib/employees/woven",
    "src/app/api/admin/employees/woven",
    "src/app/api/employees/woven",
    "src/features/admin/woven",
    "src/app/(app)/admin/integrations/woven",
  ];
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
    });
  }
  const repo = join(__dirname, "..", "..", "..", "..");
  const files = ROOTS.flatMap((root) => sources(join(repo, root)));
  const code = (file: string) =>
    readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  /* The six sync tables, their five read-only views, and `locations` (read, to name a mapped location). */
  const TABLES = new Set([
    "employee_sync_runs", "employee_access_directory", "employee_location_affiliations",
    "employee_directory_changes", "woven_location_map", "woven_position_map",
    "employee_sync_status", "employee_sync_run_summary", "employee_directory_view",
    "employee_directory_login_matches", "employee_access_preview", "locations",
    /* The access planner (stage 1): accounts through a read-only VIEW, the links, and the shadow record. */
    "employee_access_accounts", "employee_account_links", "employee_access_runs", "employee_access_actions",
  ]);
  const RPCS = new Set([
    "employee_sync_claim_run", "employee_sync_commit_run", "employee_sync_abandon_run",
    "woven_location_map_review", "woven_position_map_review",
    /* Writes ONLY employee_access_runs / employee_access_actions, mode shadow (asserted below against the SQL). */
    "employee_access_record_shadow_run",
    /*
     * TERMINATION ENFORCEMENT (20261019001000, NOT APPLIED; default-off switch
     * WOVEN_TERMINATION_ENFORCEMENT). The only three functions that may change
     * an account because of Woven. Asserted against the SQL in section 9.
     */
    "employee_access_disable_terminated",
    "employee_access_record_revocation",
    "employee_access_record_apply_run",
  ]);

  it("covers the whole employee-sync surface", () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files.some((f) => f.endsWith(join("sync", "route.ts")))).toBe(true);
    expect(files.some((f) => f.endsWith("sync-panel.tsx"))).toBe(true);
  });

  it("every table read or written is an employee-sync table or view (or a read of locations)", () => {
    for (const file of files) {
      for (const [, table] of code(file).matchAll(/\.from\(\s*["'`]([^"'`]+)["'`]/g)) expect(TABLES, `${file}: ${table}`).toContain(table);
    }
  });

  it("every database function called is an employee-sync function", () => {
    for (const file of files) {
      for (const [, fn] of code(file).matchAll(/\.rpc\(\s*["'`]([^"'`]+)["'`]/g)) expect(RPCS, `${file}: ${fn}`).toContain(fn);
    }
  });

  it("no auth client, and the only direct write is a person's change review", () => {
    const writers: string[] = [];
    for (const file of files) {
      const c = code(file);
      expect(c, file).not.toMatch(/\.auth\s*\.|auth\.admin|app_user_audit|from\(\s*["'`]app_users/);
      /* Revoking auth access is named in exactly one place: the termination wiring (section 9). */
      if (!file.endsWith(join("access", "termination-run.ts"))) expect(c, file).not.toMatch(/revokeAuthAccess|restoreAuthAccess/);
      /* A Supabase write verb on a query chain (not crypto's hash.update). */
      for (const m of c.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\)\s*\.(insert|update|upsert|delete)\(/g)) writers.push(`${m[1]}.${m[2]}`);
    }
    /* A person's change review, and a person's link review (stage 2) — nothing else. */
    expect(writers.sort()).toEqual(["employee_account_links.insert", "employee_directory_changes.update"]);
  });

  it("locations is only ever read", () => {
    for (const file of files) {
      for (const m of code(file).matchAll(/\.from\(\s*["'`]locations["'`]\)\s*\.(\w+)\(/g)) expect(m[1], file).toBe("select");
    }
  });
});

describe("8. the access planner (stage 1) applies nothing", () => {
  const repo = join(__dirname, "..", "..", "..", "..");
  const SQL = readFileSync(join(repo, "supabase/migrations/20261002002000_woven_account_links.sql"), "utf8");
  const fn = SQL.slice(SQL.indexOf("create or replace function public.employee_access_record_shadow_run"));
  const body = fn.slice(0, fn.indexOf("$$;"));

  it("the shadow recorder writes only the two access-record tables, and records only shadow", () => {
    const writes = [...body.matchAll(/\b(insert into|update|delete from)\s+public\.([a-z_]+)/gi)].map((m) => m[2]);
    expect([...new Set(writes)].sort()).toEqual(["employee_access_actions", "employee_access_runs"]);
    expect(body).not.toMatch(/app_users|auth\.|employee_account_links|app_user_audit/);
    expect(body).toMatch(/'shadow'/);
    expect(SQL).toMatch(/mode\s+text not null check \(mode in \('shadow'\)\)/);
    expect(SQL).toMatch(/result\s+text not null check \(result in \('shadow'\)\)/);
  });

  it("the migration never writes app_users or auth, and its only data change is the link backfill", () => {
    const code = SQL.replace(/--.*$/gm, "");
    expect(code).not.toMatch(/(insert into|update|delete from)\s+(public\.)?app_users\b/i);
    expect(code).not.toMatch(/(insert into|update|delete from)\s+auth\./i);
    const inserts = [...code.matchAll(/insert into public\.([a-z_]+)/g)].map((m) => m[1]);
    expect(inserts.filter((t) => t !== "employee_access_runs" && t !== "employee_access_actions")).toEqual([
      "employee_account_links",
      "employee_account_links",
    ]);
  });

  it("the backfill links only protected overrides (every managed flag off) and marks only unmatched accounts not-Woven-managed", () => {
    const backfill = SQL.slice(SQL.indexOf("-- -------------------------------------------------------------- backfill ---"));
    expect(backfill).toMatch(/'woven_linked', o\.external_employee_id, 'override_backfill'/);
    expect(backfill).not.toMatch(/managed_(status|location|role)/);
    expect(backfill).toMatch(/'not_woven_managed', 'unmatched_backfill'/);
    expect(backfill).toMatch(/not exists \(\s*select 1 from public\.employee_access_directory d/);
  });

  it("no access-planner module calls the auth API or names app_users; only link-store.ts writes, and only a link", () => {
    const dir = join(repo, "src/lib/employees/woven/access");
    for (const name of readdirSync(dir).filter((n) => /\.ts$/.test(n) && !/\.test\./.test(n))) {
      const code = readFileSync(join(dir, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(code, name).not.toMatch(/\.auth\s*\.|auth\.admin|from\(\s*["'`]app_users|restoreAuthAccess/);
      /* DELIBERATE (termination enforcement): exactly one module wires revokeAuthAccess. No other access module may name it. */
      if (name !== "termination-run.ts") expect(code, name).not.toMatch(/revokeAuthAccess/);
      /* The one write: link-store.ts records a person's link review. */
      const writes = [...code.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\)\s*\.(insert|update|upsert|delete)\(/g)].map((m) => `${m[1]}.${m[2]}`);
      expect(writes, name).toEqual(name === "link-store.ts" ? ["employee_account_links.insert"] : []);
    }
  });

  it("every new object revokes ALL from service_role too, then grants it exactly what the server needs — no inherited default privileges", () => {
    const code = SQL.replace(/--.*$/gm, "");
    for (const relation of ["employee_account_links", "employee_access_runs", "employee_access_actions", "employee_access_accounts"]) {
      expect(code, relation).toMatch(new RegExp(`revoke all on public\\.${relation} from public, anon, authenticated, service_role;`));
    }
    const grants = [...code.matchAll(/grant ([a-z, ]+) on (?:function )?public\.([a-z_]+)[^;]* to ([a-z_, ]+);/g)].map((m) => `${m[2]}:${m[1]}:${m[3]}`);
    expect(grants.sort()).toEqual([
      "employee_access_accounts:select:service_role",
      "employee_access_actions:select, insert:service_role",
      "employee_access_record_shadow_run:execute:service_role",
      "employee_access_runs:select, insert:service_role",
      "employee_account_links:select, insert:service_role",
    ]);
    expect(code).not.toMatch(/grant [^;]*(update|delete|truncate|all)[^;]* to/i);
    expect(code).toMatch(/revoke all on function public\.employee_access_actions_guard\(\) from public, anon, authenticated, service_role;/);
  });

  it("the access mode has no apply value", () => {
    const config = readFileSync(join(repo, "src/lib/employees/woven/access/config.ts"), "utf8");
    expect(config).toMatch(/export type WovenAccessMode = "off" \| "shadow";/);
  });
});

describe("9. termination enforcement is the ONE apply path, default off, and bounded", () => {
  /*
   * DELIBERATE CHANGE to this file (the access planner of section 8 stays
   * apply-free; WOVEN_ACCESS_MODE still has no apply value). What changed:
   *   - three database functions are allowed in section 7's RPC list;
   *   - `revokeAuthAccess` may be named by access/termination-run.ts only;
   *   - this section pins what that path may and may not do.
   * Nothing else in sections 1-8 was loosened.
   */
  const repo = join(__dirname, "..", "..", "..", "..");
  const SQL = readFileSync(join(repo, "supabase/migrations/20261019001000_woven_disable_terminated_apply.sql"), "utf8");
  const code = SQL.replace(/--.*$/gm, "");
  const accessDir = join(repo, "src/lib/employees/woven/access");
  const read = (name: string) => readFileSync(join(accessDir, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  it("the migration is a NEW file, later than every earlier one, and says it is not applied", () => {
    const names = readdirSync(join(repo, "supabase/migrations")).sort();
    expect(names[names.length - 1]).toBe("20261019001000_woven_disable_terminated_apply.sql");
    expect(SQL).toMatch(/NOT APPLIED/);
  });

  it("the only app_users write is the status change to disabled, inside disable_terminated; nothing touches auth, roles, scope or deletes", () => {
    const updates = [...code.matchAll(/\bupdate\s+public\.([a-z_]+)\s+set\s+([a-z_]+)/gi)].map((m) => `${m[1]}.${m[2]}`);
    expect(updates.sort()).toEqual(["app_users.status", "employee_account_links.access_revoked_at", "employee_account_links.terminated_at"]);
    expect(code).not.toMatch(/\b(delete\s+from|truncate|drop\s+table|drop\s+function)\b/i);
    expect(code).not.toMatch(/\bauth\./i);
    expect(code).not.toMatch(/set\s+(role|scope_|email|display_name)/i);
    expect(code).not.toMatch(/status\s*=\s*'active'/);
  });

  it("every function is revoked from everyone including service_role, then EXECUTE goes to service_role for the three entry points only; no table grant", () => {
    expect(code).toMatch(/revoke all on function %s from public, anon, authenticated, service_role/);
    const grants = [...code.matchAll(/grant ([a-z, ]+) on (?:function )?public\.([a-z_]+)[^;]* to ([a-z_, ]+);/g)].map((m) => `${m[2]}:${m[1]}:${m[3]}`);
    expect(grants.sort()).toEqual([
      "employee_access_disable_terminated:execute:service_role",
      "employee_access_record_apply_run:execute:service_role",
      "employee_access_record_revocation:execute:service_role",
    ]);
    expect(code).not.toMatch(/grant [^;]*(update|delete|truncate|insert|all)[^;]* to/i);
    for (const fn of ["disable_terminated", "record_revocation", "record_apply_run"]) {
      const start = code.indexOf(`create or replace function public.employee_access_${fn}`);
      expect(code.slice(start, start + 600), fn).toMatch(/security definer\s+set search_path = ''/);
    }
  });

  it("the audit vocabulary is not widened: only existing actions are used", () => {
    const used = [...code.matchAll(/'(status_changed|access_revoked|access_revocation_incomplete)'/g)].length;
    expect(used).toBeGreaterThanOrEqual(3);
    expect(code).not.toMatch(/app_user_audit_action_check/);
  });

  it("the switch module reads one variable and fails closed; the access mode type is unchanged", () => {
    const config = read("termination-config.ts");
    expect(config).toMatch(/raw !== "on"/);
    expect(readFileSync(join(accessDir, "config.ts"), "utf8")).toMatch(/export type WovenAccessMode = "off" \| "shadow";/);
  });

  it("the orchestrator calls only the three functions, writes no table, and never re-enables", () => {
    const c = read("terminate.ts");
    const rpcs = [...c.matchAll(/(?:rpc\(\s*|fn\s*=\s*)["'`]([a-z_]+)["'`]/g)].map((m) => m[1]);
    expect([...new Set(rpcs)].sort()).toEqual(["employee_access_disable_terminated", "employee_access_record_apply_run", "employee_access_record_revocation"]);
    expect(c).not.toMatch(/\.from\(|\.auth\s*\.|restoreAuthAccess|status:\s*["']active["']/);
  });

  it("the cron route calls it only through the switch-guarded wiring, after a successful sync", () => {
    const route = readFileSync(join(repo, "src/app/api/employees/woven/cron/route.ts"), "utf8");
    expect(route).toMatch(/outcome\.status === "succeeded" \? await runTerminationEnforcement\(CRON_REQUESTER\)/);
    expect(readFileSync(join(accessDir, "termination-run.ts"), "utf8")).toMatch(/if \(!config\.enabled\) return \{ status: "off" \};/);
  });
});
