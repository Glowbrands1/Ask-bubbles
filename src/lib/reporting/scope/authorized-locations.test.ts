import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/company/locations", () => ({
  LOCATION_CODE_PATTERN: /^[A-Za-z0-9][A-Za-z0-9-]{0,15}$/,
  COMPANY_LOCATION_ENTRIES: [
    { code: "101", name: "Testville Downtown", state: "TN", districtId: "dist-east" },
    { code: "201", name: "Sampleton Square", state: "MS", districtId: "dist-west" },
  ],
  COMPANY_DISTRICT_ENTRIES: [
    { id: "dist-east", name: "East", regionId: "reg-south" },
    { id: "dist-west", name: "West", regionId: "reg-south" },
  ],
  COMPANY_REGION_ENTRIES: [{ id: "reg-south", name: "South" }],
}));

import {
  admitsLocation,
  locationIdsForScope,
  narrowLocationSelection,
  reportingScopeOf,
  scopeNoticeSentence,
} from "./authorized-locations";

describe("reporting scope", () => {
  it("is nothing — not everything — for a missing scope", () => {
    const scope = reportingScopeOf(null);
    expect(scope.unrestricted).toBe(false);
    expect(scope.locationIds).toEqual([]);
    expect(admitsLocation(scope, "loc-101")).toBe(false);
  });

  it("is unrestricted only for global scope", () => {
    const scope = reportingScopeOf({ level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
    expect(scope.unrestricted).toBe(true);
    expect(locationIdsForScope(scope)).toBeNull();
    expect(scopeNoticeSentence(scope)).toBeNull();
  });

  it("expands a district through the roster and admits only its locations", () => {
    const scope = reportingScopeOf({ level: "district", primaryAreaId: "dist-east", alsoCoversAreaIds: [] });
    expect(scope.locationIds).toEqual(["loc-101"]);
    expect(admitsLocation(scope, "loc-101")).toBe(true);
    expect(admitsLocation(scope, "loc-201")).toBe(false);
    expect(admitsLocation(scope, null)).toBe(false);
  });

  it("lets a filter narrow the scope and never widen it", () => {
    const scope = reportingScopeOf({ level: "district", primaryAreaId: "dist-east", alsoCoversAreaIds: [] });
    expect(narrowLocationSelection(scope, ["loc-101", "loc-201"])).toEqual(["loc-101"]);
    expect(narrowLocationSelection(scope, [])).toEqual(["loc-101"]);
  });

  it("says plainly when an account has no location assigned", () => {
    const scope = reportingScopeOf({ level: "location", primaryAreaId: null, alsoCoversAreaIds: [] });
    expect(scopeNoticeSentence(scope)).toMatch(/no location assigned/);
  });
});
