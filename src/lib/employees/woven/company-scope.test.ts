import { describe, expect, it } from "vitest";

import { WovenClient } from "./client";
import {
  assertDetailsCompany,
  assertRecordCompany,
  CompanyScopeError,
  readRecordCompanyId,
  type CompanyScopedKind,
} from "./company-scope";
import { PINNED_COMPANY_ID, readWovenConfig } from "./config";
import { MemoryDirectoryStore } from "./memory-store";
import { outcomeHttpStatus, runWovenEmployeeSync, type SyncOutcome } from "./sync";
import {
  createFakeWoven,
  FAKE_COMPANY_ID,
  FAKE_CREDENTIALS,
  FAKE_STATUS,
  OTHER_COMPANY_ID,
  wovenDetails,
  wovenEmployee,
  wovenLocation,
} from "./test-support";

/**
 * ============================================================================
 * EVERY RECORD IS MIDWEST SOAP MAKERS, OR NOTHING IS SAVED
 * ============================================================================
 *
 * The token guard is proved in `client.test.ts`. These prove the second
 * layer: each employee, employee-details body, details location and catalog
 * location must name the pinned CompanyID, and one that names another
 * company — or none — refuses the WHOLE run and leaves the directory, the
 * affiliations, the change history and both maps exactly as they were.
 */

const PINNED_UPPER = PINNED_COMPANY_ID.toUpperCase();
const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";

const CONFIG = readWovenConfig({
  WOVEN_SYNC_ENABLED: "true",
  WOVEN_COMPANY_ID: FAKE_COMPANY_ID,
  WOVEN_SYNC_WRITES_ENABLED: "true",
  WOVEN_SUBSCRIPTION_KEY: FAKE_CREDENTIALS.subscriptionKey,
  WOVEN_USERNAME: FAKE_CREDENTIALS.username,
  WOVEN_PASSWORD: FAKE_CREDENTIALS.password,
  WOVEN_PAGE_SIZE: "25",
});

const NOW = () => new Date("2026-10-12T12:00:00Z");

function estate(count: number, options: Parameters<typeof wovenEmployee>[1] = {}) {
  return Array.from({ length: count }, (_, i) => wovenEmployee(String(1000 + i), options));
}

function setup(
  employees: Record<string, unknown>[],
  extra: Partial<Parameters<typeof createFakeWoven>[0]> = {},
  store = new MemoryDirectoryStore(),
) {
  const fake = createFakeWoven({ employees, tokenLifetimeSeconds: 3600, ...extra });
  const run = (dryRun = false) =>
    runWovenEmployeeSync({
      requestedBy: "cron",
      dryRun,
      config: CONFIG,
      store,
      now: NOW,
      client: new WovenClient({
        companyId: FAKE_COMPANY_ID,
        baseUrl: CONFIG.baseUrl,
        credentials: FAKE_CREDENTIALS,
        fetch: fake.fetch,
        sleep: async () => {},
      }),
    });
  return { fake, store, run };
}

/** Everything a commit could write, except the run rows. */
function saved(store: MemoryDirectoryStore) {
  return JSON.stringify({
    rows: [...store.rows.entries()],
    affiliations: [...store.affiliations.entries()].map(([id, m]) => [id, [...m.entries()]]),
    changes: store.changes,
    locationMap: [...store.locationMap.entries()],
    positionMap: [...store.positionMap.entries()],
  });
}

function rejected(outcome: SyncOutcome, code: string) {
  expect(outcome.status).toBe("rejected");
  if (outcome.status !== "rejected") throw new Error("unreachable");
  expect(outcome.code).toBe(code);
  expect(outcomeHttpStatus(outcome)).toBe(422);
  /* Counts and kinds only: never an employee id or the other company's id. */
  expect(outcome.reason).not.toMatch(/\d{4}/);
  expect(outcome.reason.toLowerCase()).not.toContain(OTHER_COMPANY_ID);
  return outcome;
}

const foreign = (record: Record<string, unknown>) => ({ ...record, CompanyID: OTHER_COMPANY_ID });
const companyless = (record: Record<string, unknown>) => {
  const copy = { ...record };
  delete copy.CompanyID;
  return copy;
};

/* ------------------------------------------------------------ the rule -- */

describe("readRecordCompanyId", () => {
  it("reads a GUID case-insensitively", () => {
    expect(readRecordCompanyId({ CompanyID: PINNED_UPPER }, ["CompanyID"])).toBe(PINNED_COMPANY_ID);
    expect(readRecordCompanyId({ CompanyID: ` ${PINNED_COMPANY_ID} ` }, ["CompanyID"])).toBe(PINNED_COMPANY_ID);
  });

  it.each([
    ["absent", {}],
    ["null", { CompanyID: null }],
    ["empty", { CompanyID: "" }],
    ["the all-zero GUID", { CompanyID: EMPTY_GUID }],
    ["not a GUID", { CompanyID: "Midwest Soap Makers" }],
    ["a number", { CompanyID: 55839 }],
  ])("is null when the CompanyID is %s", (_label, record) => {
    expect(readRecordCompanyId(record as Record<string, unknown>, ["CompanyID"])).toBeNull();
  });
});

describe("assertRecordCompany", () => {
  const kinds: CompanyScopedKind[] = ["employee", "employee_detail", "employee_location", "location"];

  it.each(kinds)("accepts a %s naming the pinned company, in either case", (kind) => {
    expect(() => assertRecordCompany({ CompanyID: PINNED_UPPER }, kind)).not.toThrow();
    expect(() => assertRecordCompany({ CompanyID: PINNED_COMPANY_ID }, kind)).not.toThrow();
  });

  it.each(kinds)("refuses a %s naming another company as a mismatch", (kind) => {
    const error = (() => {
      try {
        assertRecordCompany({ CompanyID: OTHER_COMPANY_ID }, kind);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(CompanyScopeError);
    expect(error).toMatchObject({ code: "company_scope_mismatch", kind, problem: "mismatch" });
    expect((error as Error).message.toLowerCase()).not.toContain(OTHER_COMPANY_ID);
  });

  it.each(kinds)("refuses a %s naming no company as missing — never assumed to be the pinned one", (kind) => {
    for (const record of [{}, { CompanyID: null }, { CompanyID: EMPTY_GUID }, { CompanyID: "n/a" }]) {
      expect(() => assertRecordCompany(record, kind)).toThrow(
        expect.objectContaining({ code: "company_scope_missing", kind }),
      );
    }
  });

  it("leaves a non-object entry to the normaliser, which refuses it as no record", () => {
    for (const entry of [null, "x", 7, []]) expect(() => assertRecordCompany(entry, "employee")).not.toThrow();
  });
});

describe("assertDetailsCompany", () => {
  const good = () => wovenDetails("1000", [{ id: "WL-1" }, { id: "WL-2" }]);

  it("accepts a details body and every Locations[] entry naming the pinned company", () => {
    expect(() => assertDetailsCompany(good())).not.toThrow();
  });

  it("refuses the details body itself from another company, or naming none", () => {
    expect(() => assertDetailsCompany(foreign(good()))).toThrow(
      expect.objectContaining({ code: "company_scope_mismatch", kind: "employee_detail" }),
    );
    expect(() => assertDetailsCompany(companyless(good()))).toThrow(
      expect.objectContaining({ code: "company_scope_missing", kind: "employee_detail" }),
    );
  });

  it("refuses ANY one Locations[] entry from another company, or naming none", () => {
    for (const [mutate, code] of [
      [foreign, "company_scope_mismatch"],
      [companyless, "company_scope_missing"],
    ] as const) {
      const body = good();
      const locations = body.Locations as Record<string, unknown>[];
      locations[1] = mutate(locations[1]!);
      expect(() => assertDetailsCompany(body)).toThrow(expect.objectContaining({ code, kind: "employee_location" }));
    }
  });
});

/* ------------------------------------------------- the sync, end to end -- */

describe("a run with any record outside Midwest Soap Makers saves nothing", () => {
  it("first run: one foreign employee among many refuses the run; nothing is imported and the lock is released", async () => {
    const employees = estate(12);
    employees[7] = foreign(employees[7]!);
    const { store, run } = setup(employees, { locations: [wovenLocation("WL-0306")] });

    rejected(await run(), "company_scope_mismatch");

    expect(store.rows.size).toBe(0);
    expect(store.affiliations.size).toBe(0);
    expect(store.changes).toHaveLength(0);
    expect(store.locationMap.size).toBe(0);
    expect(store.positionMap.size).toBe(0);
    expect(store.runs).toEqual([expect.objectContaining({ status: "rejected", errorCode: "company_scope_mismatch" })]);
    expect(store.runs.some((r) => r.status === "running")).toBe(false);
  });

  it("first run: an employee naming no company refuses the run as missing", async () => {
    const employees = estate(12);
    employees[3] = companyless(employees[3]!);
    const { store, run } = setup(employees);

    rejected(await run(), "company_scope_missing");
    expect(store.rows.size).toBe(0);
    expect(store.runs.at(-1)).toMatchObject({ status: "rejected", errorCode: "company_scope_missing" });
  });

  it("a later run: the directory, affiliations, history and both maps stay exactly as the last good run left them", async () => {
    const store = new MemoryDirectoryStore();
    const good = estate(12, { hasMultipleLocationAccess: true });
    const details = Object.fromEntries(
      good.map((e) => [String(e.EmployeeID), wovenDetails(String(e.EmployeeID), [{ id: "WL-0306" }, { id: "WL-0400" }])]),
    );
    const first = setup(good, { details, locations: [wovenLocation("WL-0306"), wovenLocation("WL-0400")] }, store);
    expect((await first.run()).status).toBe("succeeded");
    const before = saved(store);
    expect(store.rows.size).toBe(12);

    /* The next day Woven's read changes several things AND carries one foreign record. */
    const next = estate(14, { hasMultipleLocationAccess: true, positionId: "POS-NEW" });
    next[13] = foreign(next[13]!);
    const second = setup(next, { details, locations: [wovenLocation("WL-0306"), wovenLocation("WL-0999")] }, store);
    rejected(await second.run(), "company_scope_mismatch");

    expect(saved(store)).toBe(before);
    expect(store.runs.map((r) => r.status)).toEqual(["succeeded", "rejected"]);
  });

  it("a foreign record ONLY the terminated-status read returns still refuses the run, though that read's own failures are tolerated", async () => {
    const employees = [...estate(12), foreign(wovenEmployee("9001", { status: FAKE_STATUS.terminated }))];
    const { store, run } = setup(employees, { listReadsOmitTerminated: true });

    rejected(await run(), "company_scope_mismatch");
    expect(store.rows.size).toBe(0);
  });

  it("a foreign catalog location refuses the run, though a catalog that cannot be read is tolerated", async () => {
    const { store, run } = setup(estate(12), { locations: [wovenLocation("WL-0306"), foreign(wovenLocation("WL-X"))] });
    rejected(await run(), "company_scope_mismatch");
    expect(store.locationMap.size).toBe(0);
  });

  it("a catalog location naming no company refuses the run", async () => {
    const { run } = setup(estate(12), { locations: [companyless(wovenLocation("WL-0306"))] });
    rejected(await run(), "company_scope_missing");
  });

  it("a foreign employee-details body refuses the run, though a failed details read is tolerated", async () => {
    const employees = estate(12, { hasMultipleLocationAccess: true });
    const details = { "1004": foreign(wovenDetails("1004", [{ id: "WL-0306" }])) };
    const { store, run } = setup(employees, { details });
    rejected(await run(), "company_scope_mismatch");
    expect(store.rows.size).toBe(0);
    expect(store.affiliations.size).toBe(0);
  });

  it("one details location naming no company refuses the run", async () => {
    const employees = estate(12, { hasMultipleLocationAccess: true });
    const body = wovenDetails("1002", [{ id: "WL-0306" }, { id: "WL-0400" }]);
    (body.Locations as Record<string, unknown>[])[1] = companyless((body.Locations as Record<string, unknown>[])[1]!);
    const { store, run } = setup(employees, { details: { "1002": body } });
    rejected(await run(), "company_scope_missing");
    expect(store.rows.size).toBe(0);
  });

  it("a dry run is refused the same way, and takes no lock and writes no run row", async () => {
    const employees = estate(12);
    employees[0] = foreign(employees[0]!);
    const { store, run } = setup(employees);
    const outcome = rejected(await run(true), "company_scope_mismatch");
    expect(outcome.runId).toBeNull();
    expect(store.runs).toHaveLength(0);
    expect(store.rows.size).toBe(0);
  });

  it("after a refusal, a clean read succeeds: the refusal left no lock and no partial state behind", async () => {
    const store = new MemoryDirectoryStore();
    const bad = estate(12);
    bad[5] = foreign(bad[5]!);
    rejected(await setup(bad, {}, store).run(), "company_scope_mismatch");

    const outcome = await setup(estate(12), {}, store).run();
    expect(outcome.status).toBe("succeeded");
    expect(store.rows.size).toBe(12);
  });

  it("stops reading at the first foreign record: no details or later reads are requested", async () => {
    const employees = estate(12, { hasMultipleLocationAccess: true });
    employees[0] = foreign(employees[0]!);
    const { fake, run } = setup(employees);
    rejected(await run(), "company_scope_mismatch");
    expect(fake.calls.some((c) => /\/details$/.test(c.path))).toBe(false);
    expect(fake.calls.some((c) => c.path === "/locations")).toBe(false);
  });
});

describe("the commit itself refuses any company but the pinned one", () => {
  it("the store will not save a commit stated for another company, or none", async () => {
    const store = new MemoryDirectoryStore();
    const claim = await store.claimRun("cron");
    if (claim.status !== "claimed") throw new Error("claim");
    const stats = {
      requestsMade: 0,
      pagesFetched: 0,
      employeesReceived: 0,
      employeesActive: 0,
      employeesTerminated: 0,
      employeesStatusUnknown: 0,
      detailsFetched: 0,
      detailsSkipped: 0,
      recordsRejected: 0,
      issueCounts: {},
    };
    for (const wovenCompanyId of [OTHER_COMPANY_ID, "", undefined as unknown as string]) {
      await expect(
        store.commitRun({ runId: claim.runId, wovenCompanyId, employees: [], changes: [], locations: [], stats }),
      ).rejects.toThrow("company_scope_violation");
    }
    await expect(
      store.commitRun({ runId: claim.runId, wovenCompanyId: PINNED_UPPER, employees: [], changes: [], locations: [], stats }),
    ).resolves.toMatchObject({ status: "committed" });
  });
});
