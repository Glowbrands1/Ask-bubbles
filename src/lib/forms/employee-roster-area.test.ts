import { describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";

/*
 * DISTRICT AND REGION SCOPES ARE VERIFIED THROUGH THE STORES THEY CONTAIN.
 * A fixture roster: two districts in one region, plus a store in no district.
 */
vi.mock("@/config/company/locations", () => ({
  LOCATION_CODE_PATTERN: /^[A-Za-z0-9][A-Za-z0-9-]{0,15}$/,
  COMPANY_LOCATION_ENTRIES: [
    { code: "101", name: "Eastville", state: "TN", districtId: "dist-east" },
    { code: "102", name: "Eastburg", state: "TN", districtId: "dist-east" },
    { code: "201", name: "Westfield", state: "MS", districtId: "dist-west" },
    { code: "301", name: "Lone Store", state: null, districtId: null },
  ],
  COMPANY_DISTRICT_ENTRIES: [
    { id: "dist-east", name: "East", regionId: "reg-south" },
    { id: "dist-west", name: "West", regionId: "reg-south" },
  ],
  COMPANY_REGION_ENTRIES: [{ id: "reg-south", name: "South" }],
  COMPANY_LOCATION_NICKNAMES: {},
  COMPANY_LOCATION_ABBREVIATIONS: {},
}));
vi.mock("server-only", () => ({}));

const person = (id: string, first: string) => ({
  id, first_name: first, last_name: "Test", preferred_first_name: null, employment_status: "active",
  position_name: "Associate", last_synced_at: "2026-10-19T08:00:00Z",
});

const store = {
  employee_access_directory: [person("a", "Ann"), person("b", "Bo"), person("c", "Cy"), person("d", "Di")],
  employee_location_affiliations: [
    { employee_id: "a", woven_location_id: "w-101", active: true },
    { employee_id: "b", woven_location_id: "w-102", active: true },
    { employee_id: "c", woven_location_id: "w-201", active: true },
    { employee_id: "d", woven_location_id: "w-301", active: true },
  ],
  woven_location_map: [
    { woven_location_id: "w-101", location_id: "loc-101", status: "mapped" },
    { woven_location_id: "w-102", location_id: "loc-102", status: "mapped" },
    { woven_location_id: "w-201", location_id: "loc-201", status: "mapped" },
    { woven_location_id: "w-301", location_id: "loc-301", status: "mapped" },
  ],
} as unknown as FakeStore;

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));

const { loadScopedRosterResult } = await import("./employee-roster");

const names = async (scope: Parameters<typeof loadScopedRosterResult>[0]) => {
  const result = await loadScopedRosterResult(scope);
  return result.status === "ok" ? result.roster.map((entry) => entry.firstName).sort() : result.status;
};

describe("employees are verified within the actor's authorised scope", () => {
  it("a district manager is checked against every store in the district", async () => {
    expect(await names({ level: "district", primaryAreaId: "dist-east", alsoCoversAreaIds: [] })).toEqual(["Ann", "Bo"]);
  });

  it("a regional manager is checked against every district in the region, not the unassigned store", async () => {
    expect(await names({ level: "region", primaryAreaId: "reg-south", alsoCoversAreaIds: [] })).toEqual(["Ann", "Bo", "Cy"]);
  });

  it("an additional store granted to a district manager is included", async () => {
    expect(await names({ level: "district", primaryAreaId: "dist-east", alsoCoversAreaIds: ["loc-301"] })).toEqual(["Ann", "Bo", "Di"]);
  });

  it("a single-store manager sees only their store; global sees everyone", async () => {
    expect(await names({ level: "location", primaryAreaId: "loc-201", alsoCoversAreaIds: [] })).toEqual(["Cy"]);
    expect(await names({ level: "global", primaryAreaId: null, alsoCoversAreaIds: [] })).toEqual(["Ann", "Bo", "Cy", "Di"]);
  });

  it("an area the roster cannot resolve is unchecked — never open to everyone", async () => {
    expect(await names({ level: "district", primaryAreaId: "dist-nowhere", alsoCoversAreaIds: [] })).toBe("not_checked");
    expect(await names({ level: "region", primaryAreaId: null, alsoCoversAreaIds: [] })).toBe("not_checked");
  });

  it("carries Woven's title and sync time with each employee, and nothing else about them", async () => {
    const result = await loadScopedRosterResult({ level: "district", primaryAreaId: "dist-east", alsoCoversAreaIds: [] });
    if (result.status !== "ok") throw new Error("expected a roster");
    expect(result.roster[0]).toMatchObject({ positionName: "Associate", lastSyncedAt: "2026-10-19T08:00:00Z", employmentStatus: "active" });
  });
});
