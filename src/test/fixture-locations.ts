/**
 * A TEST-ONLY LOCATION ROSTER.
 *
 * The shipped roster (`src/config/company/locations.ts`) is deliberately empty
 * until Buff City Soap confirms its stores, so a test that needs locations
 * replaces that module with this fixture:
 *
 *   vi.mock("@/config/company/locations", async () =>
 *     (await import("@/test/fixture-locations")).fixtureLocationsModule(),
 *   );
 *
 * Invented names, each opening with its state the way a store list often
 * prints them; two districts in one region, and one store in no district.
 * None of it is a real Buff City Soap location.
 */

export const FIXTURE_LOCATION_ENTRIES = [
  { code: "101", name: "TN Testville Downtown", state: "TN", districtId: "dist-east" },
  { code: "102", name: "TN Testville Uptown", state: "TN", districtId: "dist-east" },
  { code: "201", name: "MS Sampleton Square", state: "MS", districtId: "dist-west" },
  { code: "301", name: "Lone Store", state: null, districtId: null },
] as const;

export const FIXTURE_DISTRICT_ENTRIES = [
  { id: "dist-east", name: "East", regionId: "reg-south" },
  { id: "dist-west", name: "West", regionId: "reg-south" },
] as const;

export const FIXTURE_REGION_ENTRIES = [{ id: "reg-south", name: "South" }] as const;

/** The shape of `@/config/company/locations`, filled with the fixture roster. */
export function fixtureLocationsModule() {
  return {
    LOCATION_CODE_PATTERN: /^[A-Za-z0-9][A-Za-z0-9-]{0,15}$/,
    COMPANY_LOCATION_ENTRIES: FIXTURE_LOCATION_ENTRIES,
    COMPANY_DISTRICT_ENTRIES: FIXTURE_DISTRICT_ENTRIES,
    COMPANY_REGION_ENTRIES: FIXTURE_REGION_ENTRIES,
    COMPANY_LOCATION_NICKNAMES: {},
    COMPANY_LOCATION_ABBREVIATIONS: {},
  };
}
