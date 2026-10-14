import { describe, expect, it } from "vitest";

import type { DirectoryRow, LocationMappingRow } from "@/lib/employees/woven/view-types";

import { suggestLocations } from "./woven-account-suggest";

const map = (id: string, status: "mapped" | "unmapped", code: string | null): LocationMappingRow =>
  ({ wovenLocationId: id, name: id, status, locationCode: code }) as LocationMappingRow;
const row = (over: Partial<DirectoryRow>): DirectoryRow =>
  ({ primaryLocationId: "W1", primaryLocationName: "NE Kearney", additionalLocations: [], temporaryOrExpiringLocations: [], hasAllLocationAccess: false, ...over }) as DirectoryRow;
const maps = [map("W1", "mapped", "66"), map("W2", "mapped", "67"), map("W3", "unmapped", null), map("W4", "mapped", "999")];

describe("suggestLocations", () => {
  it("preselects only mapped, on-roster locations: primary plus additional", () => {
    const r = suggestLocations(row({ additionalLocations: [{ wovenLocationId: "W2", name: "NE Bellevue", number: null, expiresOn: null }] }), maps);
    expect(r.suggestion).toEqual({ level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: ["loc-67"] });
  });
  it("shows unmatched locations as unmatched and never suggests them", () => {
    const r = suggestLocations(row({ primaryLocationId: "W3", additionalLocations: [{ wovenLocationId: "W4", name: "X", number: null, expiresOn: null }] }), maps);
    expect(r.primary?.areaId).toBeNull();
    expect(r.additional[0]?.areaId).toBeNull();
    expect(r.suggestion.level).toBe("none");
  });
  it("lists temporary assignments separately and never suggests them", () => {
    const r = suggestLocations(row({ temporaryOrExpiringLocations: [{ wovenLocationId: "W2", name: "NE Bellevue", number: null, expiresOn: "2026-12-01" }] }), maps);
    expect(r.temporary).toHaveLength(1);
    expect(r.suggestion.alsoCoversAreaIds).toEqual([]);
  });
  it("offers Global for Woven's all-locations flag as a suggestion without needing a store", () => {
    const r = suggestLocations(row({ primaryLocationId: null, primaryLocationName: null, hasAllLocationAccess: true }), maps);
    expect(r.suggestion).toEqual({ level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
    expect(r.hasAllLocationAccess).toBe(true);
  });
});
