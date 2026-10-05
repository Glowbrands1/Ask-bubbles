import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixture-locations")).fixtureLocationsModule(),
);

import {
  EXCLUDED_EMPLOYEE_NAMES_ENV,
  configuredExcludedNames,
  excludedRecordsNote,
  isProductionRecord,
  nonProductionReason,
} from "./production-records";
import { COMPANY_LOCATIONS as PRODUCTION_LOCATIONS } from "@/lib/locations";

/**
 * Records created by testing against a deployment — an invented employee, a
 * location the business does not operate — must stay off a manager's summary.
 * What is tested here is the MECHANISM that keeps such a record off it, not a
 * list of names, which must be nowhere in the source.
 *
 * The roster is the test fixture (`src/test/fixture-locations.ts`), not Buff's.
 */

const REAL_LOCATION = PRODUCTION_LOCATIONS[0].name;

describe("a location that is not on the roster is not production data", () => {
  it("holds back a record filed against a location the business does not operate", () => {
    /*
     * "Nowhere Plaza" is caught STRUCTURALLY, by not being on the roster — so
     * the next invented location is caught too, without anybody adding it to a
     * list.
     */
    const reason = nonProductionReason({
      employeeName: "Someone",
      locationName: "Nowhere Plaza",
    });
    expect(reason).toBe("location_not_on_roster");
    expect(isProductionRecord({ employeeName: "Someone", locationName: "Nowhere Plaza" })).toBe(
      false,
    );
  });

  it("keeps every record filed against a real location", () => {
    for (const location of PRODUCTION_LOCATIONS) {
      expect(
        isProductionRecord({ employeeName: "Someone", locationName: location.name }),
      ).toBe(true);
    }
  });

  it("matches a roster name whatever its spacing or case", () => {
    expect(
      isProductionRecord({
        employeeName: "Someone",
        locationName: `  ${REAL_LOCATION.toUpperCase()}  `,
      }),
    ).toBe(true);
  });

  it("treats a record with NO location as production data", () => {
    /*
     * A form can legitimately carry no location: an administrator's account covers
     * every location rather than one, and `proposeLocation` fills in nothing for
     * them. Treating a blank as suspicious would hide an administrator's own
     * real work.
     */
    expect(isProductionRecord({ employeeName: "Someone", locationName: null })).toBe(true);
  });
});

describe("the explicit exclusion list is configuration, and empty by default", () => {
  it("excludes nothing when the variable is unset", () => {
    expect(configuredExcludedNames({}).size).toBe(0);
    expect(configuredExcludedNames({ [EXCLUDED_EMPLOYEE_NAMES_ENV]: "" }).size).toBe(0);
  });

  it("reads a comma-separated list", () => {
    const names = configuredExcludedNames({
      [EXCLUDED_EMPLOYEE_NAMES_ENV]: "Test Person, Another Tester",
    });
    expect(names.has("test person")).toBe(true);
    expect(names.has("another tester")).toBe(true);
  });

  it("holds back a configured name filed against a real location", () => {
    const excludedNames = configuredExcludedNames({
      [EXCLUDED_EMPLOYEE_NAMES_ENV]: "Test Person",
    });
    expect(
      nonProductionReason(
        { employeeName: "Test Person", locationName: REAL_LOCATION },
        { excludedNames },
      ),
    ).toBe("excluded_by_configuration");
    // And leaves everyone else alone.
    expect(
      isProductionRecord(
        { employeeName: "A Real Manager", locationName: REAL_LOCATION },
        { excludedNames },
      ),
    ).toBe(true);
  });

  it("compares names insensitively to case and spacing", () => {
    const excludedNames = configuredExcludedNames({
      [EXCLUDED_EMPLOYEE_NAMES_ENV]: "test person",
    });
    expect(
      isProductionRecord(
        { employeeName: "  TEST   PERSON ", locationName: REAL_LOCATION },
        { excludedNames },
      ),
    ).toBe(false);
  });
});

describe("no example record is compiled into the product", () => {
  it("names none of the test records this file uses", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/lib/forms/production-records.ts", "utf8");
    /*
     * What must not exist is a hard-coded list — a name in a
     * source file is a guess that ages badly and cannot be changed without a
     * deploy. Stripping the comments is how the two are told apart.
     */
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const name of ["Pat Example", "Casey Sample", "Nowhere Plaza"]) {
      expect(code).not.toContain(name);
    }
  });
});

describe("holding a record back is said out loud", () => {
  it("names the count and where the records still are", () => {
    expect(excludedRecordsNote(1)).toMatch(/1 record is/);
    expect(excludedRecordsNote(3)).toMatch(/3 records are/);
    expect(excludedRecordsNote(3)).toMatch(/still in Form Monitoring/);
    // Nothing is described as deleted, because nothing is.
    expect(excludedRecordsNote(3)).not.toMatch(/delet|remov/i);
  });
});

/**
 * ============================================================================
 * THE ID IS THE FIELD THAT SURVIVES ON THE LIVE TABLE
 * ============================================================================
 *
 * A roster guard that read `locationName` only would catch very little: rows
 * on `form_instance_overview` often carry a null `location_name` and only a
 * `location_id`. A test record filed against an id the roster does not know,
 * with no name at all, is caught by the same rule applied to the ID; applied
 * to the name it could not be, because there is no name to apply it to.
 */
describe("the roster guard on the location id", () => {
  it("refuses a record filed against a location id the roster does not know", () => {
    // Well-formed ids that are simply not on the roster.
    for (const locationId of ["loc-901", "loc-902", "loc-909", "loc-911"]) {
      expect(
        isProductionRecord({ employeeName: "Someone", locationName: null, locationId }),
        locationId,
      ).toBe(false);
      expect(
        nonProductionReason({ employeeName: "Someone", locationName: null, locationId }),
      ).toBe("location_not_on_roster");
    }
  });

  it("catches a nameless record by its id, which the name check could not", () => {
    expect(
      isProductionRecord({
        employeeName: "Casey Sample",
        locationName: null,
        locationId: "loc-909",
      }),
    ).toBe(false);
  });

  it("keeps every record filed against a location on the roster", () => {
    for (const location of PRODUCTION_LOCATIONS) {
      expect(
        isProductionRecord({
          employeeName: "A Real Employee",
          locationName: null,
          locationId: location.id,
        }),
        location.id,
      ).toBe(true);
    }
  });

  it("keeps a record with NO location at all", () => {
    /*
     * An administrator's form legitimately carries no location — see
     * `proposeLocation` — so an absent id says nothing either way. Refusing it
     * would hide real work, which is worse than showing a test record.
     */
    expect(
      isProductionRecord({ employeeName: "An Administrator", locationName: null }),
    ).toBe(true);
    expect(
      isProductionRecord({ employeeName: "An Administrator", locationName: null, locationId: null }),
    ).toBe(true);
  });

  it("still refuses on the NAME when only the name is present", () => {
    // The original rule is unchanged; the id check is an addition, not a
    // replacement. This row carries both, and its id is a real roster id.
    expect(
      isProductionRecord({
        employeeName: "Pat Example (test)",
        locationName: "Nowhere Plaza",
        locationId: "loc-102",
      }),
    ).toBe(false);
  });
});
