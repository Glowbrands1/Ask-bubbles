/**
 * THE REFERENCE PLATFORM'S STORE ROSTER, FOR ITS REGRESSION TESTS ONLY.
 *
 * The forms and chat regression tests ported from the reference platform were
 * written against its fifteen-store roster: state-prefixed names, three
 * stores sharing a city, numbered stores, names that are also words. Those
 * properties are what the tests exercise, so a test that replays them
 * replaces `@/config/company/locations` with this roster:
 *
 *   vi.mock("@/config/company/locations", async () =>
 *     (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
 *   );
 *
 * Store names and numbers only — public storefront data, no people. Never
 * imported by production code; the shipped roster is Buff City Soap's own.
 */

const DIST_A = "dist-reference-a";
const DIST_B = "dist-reference-b";
const DIST_C = "dist-reference-c";

export const REFERENCE_LOCATION_ENTRIES = [
  { code: "0306", name: "MO Kansas City Wornall", state: "MO", districtId: DIST_A },
  { code: "0307", name: "NE Grand Island", state: "NE", districtId: DIST_B },
  { code: "0309", name: "NE Kearney", state: "NE", districtId: DIST_B },
  { code: "0310", name: "NE Lincoln 27th Street", state: "NE", districtId: DIST_B },
  { code: "0311", name: "NE Lincoln O Street", state: "NE", districtId: DIST_B },
  { code: "0312", name: "NE Lincoln Pine Lake", state: "NE", districtId: DIST_B },
  { code: "0313", name: "NE Omaha 132nd and Maple", state: "NE", districtId: DIST_C },
  { code: "0314", name: "NE Omaha 144th and Center", state: "NE", districtId: DIST_C },
  { code: "0394", name: "MO Kansas City Liberty", state: "MO", districtId: DIST_A },
  { code: "0410", name: "NE Omaha Pacific", state: "NE", districtId: DIST_C },
  { code: "0462", name: "KS Manhattan", state: "KS", districtId: DIST_A },
  { code: "0463", name: "KS Shawnee Mission Pkwy", state: "KS", districtId: DIST_A },
  { code: "0468", name: "KS Lawrence", state: "KS", districtId: DIST_A },
  { code: "0476", name: "KS Overland Park", state: "KS", districtId: DIST_A },
  { code: "0495", name: "MO St Joseph", state: "MO", districtId: DIST_C },
] as const;

export const REFERENCE_DISTRICT_ENTRIES = [
  { id: DIST_A, name: "District A", regionId: "reg-reference" },
  { id: DIST_B, name: "District B", regionId: "reg-reference" },
  { id: DIST_C, name: "District C", regionId: "reg-reference" },
] as const;

export const REFERENCE_REGION_ENTRIES = [{ id: "reg-reference", name: "Reference Region" }] as const;

/** The shape of `@/config/company/locations`, filled with the reference roster. */
export function referenceRosterModule() {
  return {
    LOCATION_CODE_PATTERN: /^[A-Za-z0-9][A-Za-z0-9-]{0,15}$/,
    COMPANY_LOCATION_ENTRIES: REFERENCE_LOCATION_ENTRIES,
    COMPANY_DISTRICT_ENTRIES: REFERENCE_DISTRICT_ENTRIES,
    COMPANY_REGION_ENTRIES: REFERENCE_REGION_ENTRIES,
    // The reference platform's reviewed nicknames and abbreviation.
    COMPANY_LOCATION_NICKNAMES: { shawnee: "0463", "shawnee mission": "0463", "st joe": "0495" },
    COMPANY_LOCATION_ABBREVIATIONS: { kc: "kansas city" },
  };
}
