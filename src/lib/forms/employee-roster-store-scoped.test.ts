import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope } from "@/types";

/**
 * ROSTER_STORE_SCOPED_ENABLED (master plan step 1, 3 Nov 2026): name checks
 * and the staff list read only the manager's own stores' active people, paged
 * under the database's 1,000-row cap, minus the reviewed store logins.
 *
 * Pass, as the plan states it: Dodge Account absent; terminated absent; the
 * store roster equals the count of active people affiliated with the store; the
 * whole directory is never loaded. Flag off: the roster is today's, exactly.
 */

const tables = {} as FakeStore & Record<string, Record<string, unknown>[]>;
/** Every read, with the filters it carried, to prove what was (not) loaded. */
const reads: { table: string; calls: string[] }[] = [];
/** The real service's cap: at most this many rows per response, whatever `.limit()` says. */
const cap = vi.hoisted(() => ({ rows: 1000 }));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      const query = fakeSupabase(tables).from(table) as unknown as Record<string, (...args: unknown[]) => unknown>;
      const read = { table, calls: [] as string[] };
      reads.push(read);
      const proxy: Record<string, unknown> = new Proxy(query, {
        get(target, key) {
          if (key === "then") {
            return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
              (target.then as (a: (value: { data: unknown[] | null; error: unknown }) => unknown, b: unknown) => unknown).call(
                target,
                (value) => resolve({ ...value, data: Array.isArray(value.data) ? value.data.slice(0, cap.rows) : value.data }),
                reject,
              );
          }
          const value = target[key as string];
          if (typeof value !== "function") return value;
          return (...args: unknown[]) => {
            read.calls.push(`${String(key)}(${args.map((arg) => (Array.isArray(arg) ? `[${arg.length}]` : JSON.stringify(arg))).join(",")})`);
            value.apply(target, args);
            return proxy;
          };
        },
      });
      return proxy;
    },
  }),
}));

const { loadScopedRoster, loadScopedRosterResult, readDirectoryFacts, readStoreRoster } = await import("./employee-roster");
const { ROSTER_NON_PERSON } = await import("./roster-non-person");

const KEARNEY = "loc-66";
const DODGE = "loc-264";
const DODGE_LOGIN = ROSTER_NON_PERSON.find((row) => /Dodge/.test(row.reason))!.wovenEmployeeId;

function person(id: string, first: string, last: string, store: string, extra: Record<string, unknown> = {}) {
  tables.employee_access_directory!.push({
    id,
    external_employee_id: `woven-${id}`,
    first_name: first,
    last_name: last,
    preferred_first_name: null,
    employment_status: "active",
    position_name: "Team Member Part Time",
    last_synced_at: "2026-11-02T11:18:00Z",
    primary_location_name: null,
    ...extra,
  });
  tables.employee_location_affiliations!.push({ employee_id: id, woven_location_id: `w-${store}`, active: true });
}

const storeScope = (id: string): AccessScope => ({ level: "location", primaryAreaId: id, alsoCoversAreaIds: [] });
const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const names = (rows: readonly { firstName: string; lastName: string }[]) => rows.map((row) => `${row.firstName} ${row.lastName}`).sort();

beforeEach(() => {
  tables.employee_access_directory = [];
  tables.employee_location_affiliations = [];
  tables.woven_location_map = [
    { woven_location_id: `w-${KEARNEY}`, location_id: KEARNEY, status: "mapped" },
    { woven_location_id: `w-${DODGE}`, location_id: DODGE, status: "mapped" },
    { woven_location_id: "w-unmapped", location_id: null, status: "unmapped" },
  ];
  reads.length = 0;
  cap.rows = 1000;
  person("p1", "Avery", "Quill", KEARNEY);
  person("p2", "Blair", "Fennick", KEARNEY, { employment_status: "terminated" });
  person("p3", "Casey", "Morrow", KEARNEY, { employment_status: "unknown" });
  person("p4", "Dana", "Hollis", DODGE);
  person("login", "Dodge", "Account", DODGE, { external_employee_id: DODGE_LOGIN, position_name: "Team Member Full Time" });
  person("p5", "Risk", "Management", DODGE);
  // An inactive affiliation is not a store's person.
  tables.employee_location_affiliations.push({ employee_id: "p4", woven_location_id: `w-${KEARNEY}`, active: false });
});

afterEach(() => {
  delete process.env.ROSTER_STORE_SCOPED_ENABLED;
});

describe("ROSTER_STORE_SCOPED_ENABLED off", () => {
  it("is today's roster: the whole directory, scoped in memory, the store login and unknown statuses included", async () => {
    expect(names(await loadScopedRoster(storeScope(DODGE)))).toEqual(["Dana Hollis", "Dodge Account"]);
    expect(names(await loadScopedRoster(storeScope(KEARNEY)))).toEqual(["Avery Quill", "Casey Morrow"]);
    const directory = reads.filter((read) => read.table === "employee_access_directory");
    expect(directory.length).toBeGreaterThan(0);
    expect(directory.every((read) => read.calls.includes("limit(5000)"))).toBe(true);
  });
});

describe("ROSTER_STORE_SCOPED_ENABLED on", () => {
  beforeEach(() => {
    process.env.ROSTER_STORE_SCOPED_ENABLED = "true";
  });

  it("leaves out the Dodge Account login, by its reviewed Woven id", async () => {
    expect(names(await loadScopedRoster(storeScope(DODGE)))).toEqual(["Dana Hollis"]);
  });

  it("leaves out terminated and unknown statuses: active people only", async () => {
    expect(names(await loadScopedRoster(storeScope(KEARNEY)))).toEqual(["Avery Quill"]);
  });

  it("a store roster is exactly the store's active, affiliated people", async () => {
    const roster = await loadScopedRoster(storeScope(KEARNEY));
    const expected = tables.employee_location_affiliations!.filter(
      (row) =>
        row.active === true &&
        row.woven_location_id === `w-${KEARNEY}` &&
        tables.employee_access_directory!.find((entry) => entry.id === row.employee_id)?.employment_status === "active",
    );
    expect(roster).toHaveLength(expected.length);
    expect(roster[0]!.locationIds).toEqual([KEARNEY]);
  });

  it("a global scope is every configured store, still without the login or the service account", async () => {
    expect(names(await loadScopedRoster(GLOBAL))).toEqual(["Avery Quill", "Dana Hollis"]);
  });

  it("never loads the whole directory: every directory read is filtered to the store's people and paged", async () => {
    await loadScopedRoster(storeScope(KEARNEY));
    const directory = reads.filter((read) => read.table === "employee_access_directory");
    expect(directory.length).toBeGreaterThan(0);
    for (const read of directory) {
      expect(read.calls.some((call) => call.startsWith('in("id"'))).toBe(true);
      expect(read.calls).toContain('eq("employment_status","active")');
      expect(read.calls.some((call) => call.startsWith("range("))).toBe(true);
      expect(read.calls.some((call) => call.startsWith("limit("))).toBe(false);
    }
    for (const read of reads.filter((entry) => entry.table === "employee_location_affiliations")) {
      expect(read.calls.some((call) => call.startsWith('in("woven_location_id"'))).toBe(true);
    }
  });

  it("pages past the 1,000-row cap instead of being cut short", async () => {
    for (let index = 0; index < 1205; index += 1) person(`bulk-${String(index).padStart(4, "0")}`, "Bulk", `Person${index}`, KEARNEY);
    const roster = await readStoreRoster(storeScope(KEARNEY));
    expect(roster).toHaveLength(1206);
    // Flag off, the same directory is cut at the cap with no error.
    delete process.env.ROSTER_STORE_SCOPED_ENABLED;
    expect((await loadScopedRoster(storeScope(KEARNEY))).length).toBeLessThan(1206);
  });

  it("a read error is unavailable, never nobody and never everyone", async () => {
    delete (tables as Record<string, unknown>).employee_location_affiliations;
    await expect(loadScopedRosterResult(storeScope(KEARNEY))).resolves.toEqual({ status: "unavailable" });
    await expect(readDirectoryFacts(storeScope(KEARNEY))).resolves.toEqual([]);
  });

  it("the grounded facts read the same store roster, with title", async () => {
    const facts = await readDirectoryFacts(storeScope(DODGE));
    expect(facts.map((fact) => [fact.firstName, fact.title])).toEqual([["Dana", "Team Member Part Time"]]);
  });

  it("no scope, or an area that resolves to no store, reads nothing", async () => {
    expect(await readStoreRoster(null)).toEqual([]);
    expect(await readStoreRoster({ level: "district", primaryAreaId: "nowhere", alsoCoversAreaIds: [] })).toEqual([]);
    expect(reads).toEqual([]);
  });
});
