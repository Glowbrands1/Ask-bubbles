import { describe, expect, it } from "vitest";

import { COMPANY_LOCATIONS } from "@/lib/locations";
import { authorizedLocationIds } from "@/lib/forms/location-scope";
import type { AccessScope } from "@/types";

import {
  ADDITIONAL_LOCATION_OPTIONS,
  additionalLocationOptions,
  cleanAdditionalLocations,
  unknownAdditionalAreaIds,
} from "./additional-locations";

describe("additional location options", () => {
  it("offers every location by stable id", () => {
    expect(ADDITIONAL_LOCATION_OPTIONS.map((o) => o.id)).toEqual(COMPANY_LOCATIONS.map((l) => l.id));
    expect(ADDITIONAL_LOCATION_OPTIONS.every((o) => /^loc-\d+$/.test(o.id))).toBe(true);
  });

  it("excludes the primary location", () => {
    const options = additionalLocationOptions("loc-66");
    expect(options.map((o) => o.id)).not.toContain("loc-66");
    expect(options).toHaveLength(COMPANY_LOCATIONS.length - 1);
  });

  it("excludes nothing when the primary is an area", () => {
    expect(additionalLocationOptions(null)).toHaveLength(COMPANY_LOCATIONS.length);
    expect(additionalLocationOptions("dist-a")).toHaveLength(COMPANY_LOCATIONS.length);
  });
});

describe("cleanAdditionalLocations", () => {
  const one = { level: "location", primaryAreaId: "loc-66" } as const;
  it("de-duplicates, drops the primary and keeps order", () => {
    expect(cleanAdditionalLocations(["loc-67", "loc-66", "loc-67", "loc-219"], one)).toEqual(["loc-67", "loc-219"]);
  });
  it("is empty for global, and ignores blanks", () => {
    expect(cleanAdditionalLocations(["loc-67"], { level: "global", primaryAreaId: null })).toEqual([]);
    expect(cleanAdditionalLocations(["", "  ", "loc-67"], one)).toEqual(["loc-67"]);
  });
});

describe("unknownAdditionalAreaIds", () => {
  it("accepts rostered locations at every level, rejects others and display names", () => {
    for (const level of ["location", "district", "region"] as const) {
      expect(unknownAdditionalAreaIds(["loc-67"], level), level).toEqual([]);
    }
    expect(unknownAdditionalAreaIds(["loc-9999", "Bellevue, NE"], "location")).toEqual(["loc-9999", "Bellevue, NE"]);
  });
});

/**
 * WHAT THE EXISTING RESOLVER GRANTS for an account with additional locations —
 * pinned here because this feature only works if it does. No resolver change
 * was needed in this repository; this proves it, and that nothing widens.
 */
describe("what additional locations grant (existing resolver)", () => {
  const scope = (level: AccessScope["level"], primaryAreaId: string | null, alsoCoversAreaIds: string[]): AccessScope => ({
    level,
    primaryAreaId,
    alsoCoversAreaIds,
  });

  it("one location: only the primary", () => {
    expect(authorizedLocationIds(scope("location", "loc-66", []))).toEqual(["loc-66"]);
  });

  it("primary + additional: exactly those, and no other roster location", () => {
    const ids = authorizedLocationIds(scope("location", "loc-66", ["loc-67", "loc-219"]));
    expect(ids.sort()).toEqual(["loc-219", "loc-66", "loc-67"]);
    for (const l of COMPANY_LOCATIONS) expect(ids.includes(l.id)).toBe(["loc-66", "loc-67", "loc-219"].includes(l.id));
  });

  it("a duplicate or the primary listed again changes nothing", () => {
    expect(authorizedLocationIds(scope("location", "loc-66", ["loc-66", "loc-67", "loc-67"])).sort()).toEqual(["loc-66", "loc-67"]);
  });

  it("an explicit location beside a district or region adds exactly that location", () => {
    for (const level of ["district", "region"] as const) {
      expect(authorizedLocationIds(scope(level, `${level === "district" ? "dist" : "reg"}-none`, ["loc-338"])), level).toEqual(["loc-338"]);
    }
  });

  it("an unknown area grants nothing (fails closed)", () => {
    expect(authorizedLocationIds(scope("district", "dist-gone", []))).toEqual([]);
  });
});
