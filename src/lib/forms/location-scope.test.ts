import { describe, expect, it, vi } from "vitest";

/*
 * A TEST ROSTER. The shipped roster is empty until Buff City Soap confirms its
 * locations, so the scope rules are exercised against a small fixture instead.
 * Two districts in one region, plus a store in no district at all.
 */
vi.mock("@/config/company/locations", () => ({
  LOCATION_CODE_PATTERN: /^[A-Za-z0-9][A-Za-z0-9-]{0,15}$/,
  COMPANY_LOCATION_ENTRIES: [
    { code: "101", name: "Testville Downtown", state: "TN", districtId: "dist-east" },
    { code: "102", name: "Testville Uptown", state: "TN", districtId: "dist-east" },
    { code: "201", name: "Sampleton Square", state: "MS", districtId: "dist-west" },
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

import type { AccessScope } from "@/types";

import { authorizeLocation, authorizedLocationIds, proposeLocation } from "./location-scope";

const scope = (
  level: AccessScope["level"],
  primary: string | null,
  also: string[] = [],
): AccessScope => ({ level, primaryAreaId: primary, alsoCoversAreaIds: also });

describe("the locations a scope may file against", () => {
  it("is a location manager's own assignment, de-duplicated", () => {
    expect(authorizedLocationIds(scope("location", "loc-101", ["loc-102", "loc-101"]))).toEqual([
      "loc-101",
      "loc-102",
    ]);
  });

  it("expands a district to the roster locations inside it", () => {
    expect(authorizedLocationIds(scope("district", "dist-east"))).toEqual(["loc-101", "loc-102"]);
  });

  it("expands a region through its districts", () => {
    expect(authorizedLocationIds(scope("region", "reg-south")).sort()).toEqual([
      "loc-101",
      "loc-102",
      "loc-201",
    ]);
  });

  it("resolves an area the roster does not know to nothing — fail closed", () => {
    expect(authorizedLocationIds(scope("district", "dist-nowhere"))).toEqual([]);
    expect(authorizedLocationIds(scope("region", "loc-101"))).toEqual(["loc-101"]);
    expect(authorizedLocationIds(scope("district", null))).toEqual([]);
  });

  it("gives a global account every roster location", () => {
    expect(authorizedLocationIds(scope("global", null))).toHaveLength(4);
  });
});

describe("authorizeLocation", () => {
  it("authorizes a location inside the actor's scope", () => {
    expect(authorizeLocation(scope("district", "dist-east"), "loc-102")).toEqual({
      kind: "authorized",
      locationId: "loc-102",
    });
  });

  it("refuses a location outside it, whatever the request body says", () => {
    const result = authorizeLocation(scope("district", "dist-east"), "loc-201");
    expect(result.kind).toBe("refused");
    expect(authorizeLocation(scope("location", "loc-101"), "loc-102").kind).toBe("refused");
  });

  it("files nothing against a location when none is requested", () => {
    expect(authorizeLocation(scope("location", "loc-101"), "  ")).toEqual({ kind: "no_location" });
  });

  it("lets a global account name any location", () => {
    expect(authorizeLocation(scope("global", null), "loc-301").kind).toBe("authorized");
  });
});

describe("proposeLocation", () => {
  it("resolves a single-location manager to their location", () => {
    expect(proposeLocation(scope("location", "loc-101"))).toEqual({
      resolution: "resolved",
      locationId: "loc-101",
    });
  });

  it("asks a multi-location manager which one, rather than choosing", () => {
    expect(proposeLocation(scope("district", "dist-east"))).toEqual({
      resolution: "needs_selection",
      authorizedIds: ["loc-101", "loc-102"],
    });
  });

  it("uses the location the manager named, when it is in scope", () => {
    expect(proposeLocation(scope("district", "dist-east"), "this happened at store #102")).toEqual({
      resolution: "resolved",
      locationId: "loc-102",
    });
    expect(proposeLocation(scope("district", "dist-east"), "at Testville Uptown today")).toEqual({
      resolution: "resolved",
      locationId: "loc-102",
    });
  });

  it("names an out-of-scope location back to the manager instead of filing against it", () => {
    expect(proposeLocation(scope("district", "dist-east"), "over at store 201")).toEqual({
      resolution: "needs_selection",
      authorizedIds: ["loc-101", "loc-102"],
      outOfScopeName: "Sampleton Square",
    });
  });

  it("uses the employee's directory location when the manager named none", () => {
    expect(proposeLocation(scope("district", "dist-east"), "", ["loc-102", "loc-201"])).toEqual({
      resolution: "resolved",
      locationId: "loc-102",
    });
  });

  it("puts no location on a global account's form unless one was named", () => {
    expect(proposeLocation(scope("global", null)).resolution).toBe("not_applicable");
    expect(proposeLocation(scope("global", null), "store 301")).toEqual({
      resolution: "resolved",
      locationId: "loc-301",
    });
  });

  it("is unavailable with no scope and with an unassigned account", () => {
    expect(proposeLocation(null).resolution).toBe("unavailable");
    expect(proposeLocation(scope("location", null)).resolution).toBe("unavailable");
  });
});
