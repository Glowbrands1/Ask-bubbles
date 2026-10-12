import { describe, expect, it } from "vitest";

import { WovenClient } from "./client";
import { readWovenConfig } from "./config";
import { MemoryDirectoryStore } from "./memory-store";
import { runWovenEmployeeSync, type SyncSummary } from "./sync";
import { createFakeWoven, FAKE_COMPANY_ID, FAKE_CREDENTIALS, wovenEmployee, wovenLocation } from "./test-support";

/**
 * ============================================================================
 * THE FIRST MIDWEST DRY RUN, REHEARSED ON THE VERIFIED INVENTORY'S SHAPE
 * ============================================================================
 *
 * The live inventory of 12 October 2026 (read-only, no Ask Bubbles write)
 * found, for Midwest Soap Makers: 80 Active, 495 Terminated and 16
 * ActiveHidden employees; 7 of the Active carry a past or current
 * TerminationDate; 3 Terminated carry none; the employees name 12 distinct
 * primary locations, of which `GET /locations` lists 9; and Woven's list
 * reads return no terminated employee (only the terminated-status filter
 * does), and no ActiveHidden one (only the ActiveHidden filter does).
 *
 * The records here are invented: only the COUNTS and SHAPES follow the
 * inventory. Against Production's empty directory this is what the first
 * dry run should report, and it must write nothing at all.
 *
 * FORMER STAFF ARE COUNTED, NOT IMPORTED. The terminated-status read only
 * terminates people already on file; the 495 former employees it returns on
 * a first run are counted (`terminated_status_read_not_in_list_reads`), so
 * the directory starts with the 80 current employees and no former staff.
 */

const STATUS = { active: 1, terminated: 2, vendor: 10, activeHidden: 100 } as const;

const ENUMS = [
  { EnumerationName: "EmployeeStatus", PropertyName: "Active", PropertyDisplayName: "Active", PropertyValue: STATUS.active },
  { EnumerationName: "EmployeeStatus", PropertyName: "Terminated", PropertyDisplayName: "Terminated", PropertyValue: STATUS.terminated },
  { EnumerationName: "EmployeeStatus", PropertyName: "Vendor", PropertyDisplayName: "Vendor", PropertyValue: STATUS.vendor },
  { EnumerationName: "EmployeeStatus", PropertyName: "ActiveHidden", PropertyDisplayName: "Active Hidden", PropertyValue: STATUS.activeHidden },
];

const CONFIG = readWovenConfig({
  WOVEN_SYNC_ENABLED: "true",
  WOVEN_COMPANY_ID: FAKE_COMPANY_ID,
  /* Writes OFF, as in Production: only a dry run can run. */
  WOVEN_SUBSCRIPTION_KEY: FAKE_CREDENTIALS.subscriptionKey,
  WOVEN_USERNAME: FAKE_CREDENTIALS.username,
  WOVEN_PASSWORD: FAKE_CREDENTIALS.password,
  WOVEN_PAGE_SIZE: "100",
});

const TODAY = new Date("2026-10-12T15:00:00Z");

/** 12 primary locations; the catalogue lists the first 9. */
const PRIMARY_LOCATIONS = Array.from({ length: 12 }, (_, i) => `MW-LOC-${String(i + 1).padStart(2, "0")}`);
const CATALOGUE = PRIMARY_LOCATIONS.slice(0, 9).map((id, i) => wovenLocation(id, { name: `Midwest store ${i + 1}`, number: String(i + 1) }));
const POSITIONS = ["POS-TM", "POS-KH", "POS-AM", "POS-SM", "POS-DM", "POS-CORP"];

function person(n: number, status: number, extra: Parameters<typeof wovenEmployee>[1] = {}) {
  return wovenEmployee(`MW-${String(n).padStart(4, "0")}`, {
    status,
    positionId: POSITIONS[n % POSITIONS.length],
    positionName: `Position ${POSITIONS[n % POSITIONS.length]}`,
    primaryLocationId: PRIMARY_LOCATIONS[n % PRIMARY_LOCATIONS.length],
    primaryLocationName: `Primary ${PRIMARY_LOCATIONS[n % PRIMARY_LOCATIONS.length]}`,
    ...extra,
  });
}

function inventory() {
  const active = Array.from({ length: 80 }, (_, i) =>
    /* 7 Active employees carry a past or current TerminationDate. */
    person(i, STATUS.active, i < 7 ? { terminationDate: i === 0 ? "2026-10-12T00:00:00" : "2026-08-01T00:00:00" } : {}),
  );
  const terminated = Array.from({ length: 495 }, (_, i) =>
    /* 3 Terminated employees carry no TerminationDate. */
    person(1000 + i, STATUS.terminated, i < 3 ? {} : { terminationDate: "2025-06-30T00:00:00" }),
  );
  const hidden = Array.from({ length: 16 }, (_, i) => person(5000 + i, STATUS.activeHidden));
  return { active, terminated, hidden };
}

function snapshot(store: MemoryDirectoryStore) {
  return JSON.stringify({
    rows: [...store.rows.entries()],
    affiliations: [...store.affiliations.entries()].map(([k, v]) => [k, [...v.entries()]]),
    changes: store.changes,
    runs: store.runs,
    locationMap: [...store.locationMap.entries()],
    positionMap: [...store.positionMap.entries()],
  });
}

async function dryRun(employees: Record<string, unknown>[], extra: Partial<Parameters<typeof createFakeWoven>[0]> = {}) {
  const store = new MemoryDirectoryStore();
  const before = snapshot(store);
  const fake = createFakeWoven({ employees, locations: CATALOGUE, enums: ENUMS, listReadsOmitTerminated: true, tokenLifetimeSeconds: 3600, ...extra });
  const outcome = await runWovenEmployeeSync({
    requestedBy: "dry-run-rehearsal",
    dryRun: true,
    config: CONFIG,
    store,
    now: () => TODAY,
    client: new WovenClient({ companyId: FAKE_COMPANY_ID, baseUrl: CONFIG.baseUrl, credentials: FAKE_CREDENTIALS, fetch: fake.fetch, sleep: async () => {} }),
  });
  if (outcome.status !== "succeeded") throw new Error(`dry run did not succeed: ${JSON.stringify(outcome)}`);
  return { summary: outcome.summary as SyncSummary, runId: outcome.runId, store, before, fake };
}

describe("the first Midwest dry run, on the verified inventory's shape", () => {
  it("would create the 80 current employees, count the 495 former staff without importing them — and saves nothing", async () => {
    const { active, terminated, hidden } = inventory();
    /* Woven's list reads return no ActiveHidden employee: they are not in what the sync reads. */
    void hidden;
    const { summary, runId, store, before, fake } = await dryRun([...active, ...terminated]);

    expect(summary.dryRun).toBe(true);
    expect(runId).toBeNull();
    expect(snapshot(store)).toBe(before);
    expect(store.runs).toHaveLength(0);
    /* Read-only towards Woven: every call after the sign-in is a GET. */
    expect(fake.calls.filter((c) => c.path !== "/tokens/v2").every((c) => c.method === "GET")).toBe(true);

    expect(summary.employeesReceived).toBe(80);
    expect(summary.employeesActive).toBe(80);
    expect(summary.employeesTerminated).toBe(0);
    expect(summary.employeesStatusUnknown).toBe(0);
    /* Against an empty directory: every current employee is new and classified as the initial load. */
    expect(summary.changesByKind.new_employee).toBe(80);
    expect(summary.newEmployeesByClassification.initial_load).toBe(80);
    expect(summary.employeesUnchanged).toBe(0);
    expect(summary.changesByKind.terminated).toBe(0);
    /* The terminated-status read returned all 495 former staff; none is on file, so none is imported. */
    expect(summary.issueCounts.terminated_status_read_records).toBe(495);
    expect(summary.issueCounts.terminated_status_read_not_in_list_reads).toBe(495);
    expect(summary.issueCounts.terminated_status_read_matched_on_file).toBeUndefined();
    /* No location or position is mapped yet: all 12 primaries and all 6 positions are queued for review. */
    expect(summary.unmappedLocations).toBe(12);
    expect(summary.unmappedPositions).toBe(6);
  });

  it("keeps the 7 Active employees with a past or current TerminationDate active: a date alone terminates nobody", async () => {
    const { active, terminated } = inventory();
    const { summary } = await dryRun([...active, ...terminated]);
    expect(summary.employeesActive).toBe(80);
    expect(summary.employeesTerminated).toBe(0);
    expect(summary.changesByKind.terminated).toBe(0);
  });

  it("would provision no ActiveHidden employee even if a read returned them: they stay status unknown, never active", async () => {
    const { active, terminated, hidden } = inventory();
    const { summary } = await dryRun([...active, ...terminated, ...hidden]);
    expect(summary.employeesActive).toBe(80);
    expect(summary.employeesReceived).toBe(96);
    expect(summary.employeesStatusUnknown).toBe(16);
    expect(summary.issueCounts.unknown_status).toBe(16);
  });
});
