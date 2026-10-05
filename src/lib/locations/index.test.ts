import { describe, expect, it } from "vitest";

import {
  areaLabel,
  codeOfLocationId,
  isKnownAreaId,
  locationIdForCode,
  locationIdsInArea,
  locationNameKey,
  rosterProblems,
} from "./index";

describe("location ids", () => {
  it("round-trips a store code through its id", () => {
    expect(codeOfLocationId(locationIdForCode("0123"))).toBe("0123");
  });

  it("refuses anything that is not a well-formed location id", () => {
    expect(codeOfLocationId("dist-north")).toBeNull();
    expect(codeOfLocationId("loc-")).toBeNull();
    expect(codeOfLocationId("loc-../../etc")).toBeNull();
    expect(codeOfLocationId(null)).toBeNull();
  });
});

describe("the configured roster", () => {
  it("is coherent", () => {
    expect(rosterProblems()).toEqual([]);
  });

  it("resolves an unknown area to no locations — never to a guess", () => {
    expect(locationIdsInArea("loc-does-not-exist")).toEqual([]);
    expect(locationIdsInArea("dist-nowhere")).toEqual([]);
    expect(locationIdsInArea("reg-nowhere")).toEqual([]);
    expect(locationIdsInArea("something-else")).toEqual([]);
    expect(isKnownAreaId("loc-does-not-exist")).toBe(false);
  });

  it("labels an unscoped account as covering all areas", () => {
    expect(areaLabel(null)).toBe("All areas");
  });
});

describe("locationNameKey", () => {
  it("matches spellings that differ only in case, spacing and punctuation", () => {
    expect(locationNameKey("Memphis — Midtown")).toBe(locationNameKey("memphis midtown"));
    expect(locationNameKey("Soap & Co.")).toBe(locationNameKey("soap and co"));
  });
});
