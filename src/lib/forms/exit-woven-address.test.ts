import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccessScope } from "@/types";

import type { DirectoryRosterRow } from "./employee-roster";
import {
  exitEmployeeDirectoryId,
  wovenAddressLine,
  wovenExitAddress,
  wovenExitAddressEnabled,
  type WovenExitAddressDeps,
} from "./exit-woven-address";

/**
 * Pau, 25 Nov 2026: "can we auto add the permanent address in exit form? from woven?"
 *
 * The exit form's Permanent Address is read live from ONE employee's Woven details, only when the form's employee is
 * exactly one Woven person at a store the manager may see. Every name and address here is invented.
 */

const STORE: AccessScope = { level: "location", primaryAreaId: "loc-0310", alsoCoversAreaIds: [] };
const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

const row = (id: string, first: string, last: string, locationIds: string[], extra: Partial<DirectoryRosterRow> = {}): DirectoryRosterRow => ({
  id,
  firstName: first,
  lastName: last,
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds,
  ...extra,
});

const ROWS: DirectoryRosterRow[] = [
  row("d-1", "Marlow", "Quince", ["loc-0310"], { employmentStatus: "terminated" }),
  row("d-2", "Theodora", "Vale", ["loc-0310"], { preferredFirstName: "Teddy" }),
  row("d-3", "Ash", "Brook", ["loc-0310"]),
  row("d-4", "Ash", "Brook", ["loc-0311"]),
  row("d-5", "Rowan", "Pike", ["loc-0399"]),
];

describe("the one person the exit form names", () => {
  it("a terminated employee at the manager's store is found: they are the one leaving", () => {
    expect(exitEmployeeDirectoryId(ROWS, "Marlow Quince", STORE)).toBe("d-1");
    expect(exitEmployeeDirectoryId(ROWS, "  marlow   QUINCE ", STORE)).toBe("d-1");
  });

  it("the preferred first name counts", () => {
    expect(exitEmployeeDirectoryId(ROWS, "Teddy Vale", STORE)).toBe("d-2");
  });

  it("nobody outside the manager's stores", () => {
    expect(exitEmployeeDirectoryId(ROWS, "Rowan Pike", STORE)).toBeNull();
  });

  it("two people by that name: nobody (a global scope sees both Ash Brooks)", () => {
    expect(exitEmployeeDirectoryId(ROWS, "Ash Brook", STORE)).toBe("d-3");
    expect(exitEmployeeDirectoryId(ROWS, "Ash Brook", GLOBAL)).toBeNull();
  });

  /*
   * Port from the sibling app (production there, 26 Nov 2026): the exit form's employee had two active Woven rows, one at the
   * store the form is filed for and one at the corporate Woven location (no store). A global manager saw both.
   */
  it("one name, a store row and a corporate row: the row at the form's store", () => {
    const rows = [...ROWS, row("d-6", "Lyra", "Wendle", ["loc-0310"]), row("d-7", "Lyra", "Wendle", [])];
    expect(exitEmployeeDirectoryId(rows, "Lyra Wendle", GLOBAL)).toBeNull();
    expect(exitEmployeeDirectoryId(rows, "Lyra Wendle", GLOBAL, "loc-0310")).toBe("d-6");
    expect(exitEmployeeDirectoryId(rows, "Lyra Wendle", GLOBAL, "loc-0311")).toBeNull();
    expect(exitEmployeeDirectoryId(rows, "Ash Brook", GLOBAL, "loc-0311")).toBe("d-4");
  });

  it("two people by that name at the form's own store: still nobody", () => {
    const rows = [...ROWS, row("d-8", "Ash", "Brook", ["loc-0310"])];
    expect(exitEmployeeDirectoryId(rows, "Ash Brook", GLOBAL, "loc-0310")).toBeNull();
  });

  it("a first name alone, no name, or no scope: nobody", () => {
    expect(exitEmployeeDirectoryId(ROWS, "Marlow", STORE)).toBeNull();
    expect(exitEmployeeDirectoryId(ROWS, "", STORE)).toBeNull();
    expect(exitEmployeeDirectoryId(ROWS, null, STORE)).toBeNull();
    expect(exitEmployeeDirectoryId(ROWS, "Marlow Quince", null)).toBeNull();
  });
});

describe("the address line, from a Woven details body", () => {
  it("street, unit, city, state and ZIP", () => {
    expect(
      wovenAddressLine({
        EmployeeID: "E-1",
        CellPhone: "555-0100",
        Address: { Address1: "412 Invented Ln", Address2: "Apt 3", City: "Faketown", State: "NE", Zip: "68000" },
      }),
    ).toBe("412 Invented Ln, Apt 3, Faketown, NE 68000");
  });

  it("other spellings of the keys", () => {
    expect(wovenAddressLine({ HomeAddress: { AddressLine1: "9 Sample Rd", City: "Mocksville", StateCode: "KS", PostalCode: "66000" } })).toBe(
      "9 Sample Rd, Mocksville, KS 66000",
    );
  });

  it("never the store's address, and nothing without a street number and a city", () => {
    expect(wovenAddressLine({ LocationAddress: { Address1: "1 Store Plaza", City: "Faketown" } })).toBeNull();
    expect(wovenAddressLine({ Address: { Address1: "PO Box", City: "Faketown" } })).toBeNull();
    expect(wovenAddressLine({ Address: { Address1: "12 Invented Rd" } })).toBeNull();
    expect(wovenAddressLine({ Address: null })).toBeNull();
    expect(wovenAddressLine(null)).toBeNull();
    expect(wovenAddressLine([])).toBeNull();
  });
});

describe("the live read", () => {
  const deps = (over: Partial<WovenExitAddressDeps> = {}): WovenExitAddressDeps & { asked: string[] } => {
    const asked: string[] = [];
    return {
      asked,
      readDirectory: async () => ROWS,
      wovenIdOf: async (id) => (id === "d-1" ? "W-501" : null),
      readDetails: async (wovenId) => {
        asked.push(wovenId);
        return { Address: { Address1: "412 Invented Ln", City: "Faketown", State: "NE", Zip: "68000" } };
      },
      ...over,
    };
  };

  it("reads that one employee's details and returns the line", async () => {
    const live = deps();
    expect(await wovenExitAddress({ employeeName: "Marlow Quince", scope: STORE, role: "location_manager" }, live)).toBe("412 Invented Ln, Faketown, NE 68000");
    expect(live.asked).toEqual(["W-501"]);
  });

  it("a global manager's exit form reads the row at the form's store", async () => {
    const live = deps({ wovenIdOf: async (id) => (id === "d-3" ? "W-503" : "W-504") });
    expect(await wovenExitAddress({ employeeName: "Ash Brook", scope: GLOBAL, role: "admin", locationId: "loc-0310" }, live)).toBe("412 Invented Ln, Faketown, NE 68000");
    expect(live.asked).toEqual(["W-503"]);
  });

  it("asks Woven nothing when the person is not exactly one", async () => {
    const live = deps();
    expect(await wovenExitAddress({ employeeName: "Rowan Pike", scope: STORE, role: "location_manager" }, live)).toBeNull();
    expect(await wovenExitAddress({ employeeName: "Ash Brook", scope: GLOBAL, role: "admin" }, live)).toBeNull();
    expect(live.asked).toEqual([]);
  });

  it("a Woven or directory failure leaves the line blank and never throws", async () => {
    const failing = deps({
      readDetails: async () => {
        throw new Error("Woven is down");
      },
    });
    expect(await wovenExitAddress({ employeeName: "Marlow Quince", scope: STORE, role: "location_manager" }, failing)).toBeNull();
    const noDirectory = deps({
      readDirectory: async () => {
        throw new Error("directory read failed");
      },
    });
    expect(await wovenExitAddress({ employeeName: "Marlow Quince", scope: STORE, role: "location_manager" }, noDirectory)).toBeNull();
  });

  /* Pau, 26 Nov 2026, approved by Curt: "only Admins and Managers" — DMs, RMs and Store Directors. */
  it.each(["admin", "district_manager", "regional_manager", "location_manager"] as const)("a %s gets the address", async (role) => {
    expect(await wovenExitAddress({ employeeName: "Marlow Quince", scope: STORE, role }, deps())).toBe("412 Invented Ln, Faketown, NE 68000");
  });

  it.each(["assistant_manager", "employee", null] as const)("a %s gets a blank line, and Woven is not asked", async (role) => {
    const live = deps();
    expect(await wovenExitAddress({ employeeName: "Marlow Quince", scope: STORE, role }, live)).toBeNull();
    expect(live.asked).toEqual([]);
  });

  it("a slow Woven leaves the line blank", async () => {
    vi.useFakeTimers();
    const slow = deps({ readDetails: () => new Promise(() => {}) });
    const pending = wovenExitAddress({ employeeName: "Marlow Quince", scope: STORE, role: "location_manager" }, slow);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeNull();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("off unless WOVEN_EXIT_ADDRESS_ENABLED is set", async () => {
    expect(wovenExitAddressEnabled({})).toBe(false);
    expect(wovenExitAddressEnabled({ WOVEN_EXIT_ADDRESS_ENABLED: "true" })).toBe(true);
    vi.stubEnv("WOVEN_EXIT_ADDRESS_ENABLED", "");
    // Off and no stand-ins: nothing is read at all.
    expect(await wovenExitAddress({ employeeName: "Marlow Quince", scope: STORE, role: "location_manager" })).toBeNull();
  });
});
