import { describe, expect, it } from "vitest";

import type { DirectoryRow, LocationMappingRow, PositionMappingRow } from "@/lib/employees/woven/view-types";

import { inviteSuggestionForEmail } from "./woven-invite-suggestion";

/** What Woven may SUGGEST for an invitation, built on the existing `suggestLocations` rules. */

const row = (over: Partial<DirectoryRow> = {}): DirectoryRow =>
  ({
    id: "d1",
    externalEmployeeId: "E-1",
    firstName: "Kay",
    lastName: "Rowe",
    preferredFirstName: null,
    emailAddress: "kay.rowe@example.com",
    employmentStatus: "active",
    positionId: "P-LM",
    positionName: "Location Manager",
    primaryLocationId: "W-66",
    primaryLocationName: "Kearney",
    additionalLocations: [],
    temporaryOrExpiringLocations: [],
    hasAllLocationAccess: false,
    dataIssues: [],
    missingSyncCount: 0,
    ...over,
  }) as DirectoryRow;

const pos = (over: Partial<PositionMappingRow> = {}): PositionMappingRow =>
  ({ wovenPositionId: "P-LM", name: "Location Manager", status: "mapped", role: "location_manager", scopeLevel: "location", isConfirmed: true, ...over }) as PositionMappingRow;

const loc = (id: string, status: "mapped" | "unmapped" | "ignored", code: string | null): LocationMappingRow =>
  ({ wovenLocationId: id, name: id, status, locationCode: code }) as LocationMappingRow;

const LOCS = [loc("W-66", "mapped", "66"), loc("W-67", "mapped", "67"), loc("W-219", "mapped", "219"), loc("W-NEW", "unmapped", null), loc("W-X", "mapped", "999")];

const ask = (r: DirectoryRow, positions = [pos()], locations = LOCS, overridden: ReadonlySet<string> = new Set(), email = r.emailAddress ?? "") =>
  inviteSuggestionForEmail(email, [r], positions, locations, overridden);

function found(result: ReturnType<typeof ask>) {
  if (result.status !== "found") throw new Error(`expected found, got ${result.status}`);
  return result;
}

describe("one location", () => {
  it("suggests name, role, scope and primary, with no additional locations", () => {
    const { suggestion, notes } = found(ask(row()));
    expect(suggestion).toEqual({ displayName: "Kay Rowe", role: "location_manager", scopeLevel: "location", primaryAreaId: "loc-66", additionalAreaIds: [] });
    expect(notes).toEqual([]);
  });

  it("matches the email case-insensitively", () => {
    expect(found(ask(row(), undefined, undefined, undefined, "  KAY.Rowe@Example.COM ")).suggestion?.role).toBe("location_manager");
  });
});

describe("additional locations", () => {
  it("suggests mapped, on-roster additional locations, excluding the primary and duplicates", () => {
    const r = row({
      additionalLocations: [
        { wovenLocationId: "W-67", name: "Bellevue", number: null },
        { wovenLocationId: "W-66", name: "same as primary", number: null },
        { wovenLocationId: "W-219", name: "Lee's Summit", number: null },
        { wovenLocationId: "W-219", name: "again", number: null },
      ],
    });
    expect(found(ask(r)).suggestion?.additionalAreaIds).toEqual(["loc-67", "loc-219"]);
  });

  it("names unmatched locations in a note instead of guessing, including mapped-but-off-roster ones", () => {
    const r = row({ additionalLocations: [{ wovenLocationId: "W-NEW", name: "Brand New", number: null }, { wovenLocationId: "W-X", name: "Ghost", number: null }] });
    const { suggestion, notes } = found(ask(r));
    expect(suggestion?.additionalAreaIds).toEqual([]);
    expect(notes.join(" ")).toContain("Brand New");
    expect(notes.join(" ")).toContain("Ghost");
  });

  it("never suggests temporary or expiring locations", () => {
    const r = row({ temporaryOrExpiringLocations: [{ wovenLocationId: "W-67", name: "Borrowed", number: null, expiresOn: "2027-01-01" }] });
    const { suggestion, notes } = found(ask(r));
    expect(suggestion?.additionalAreaIds).toEqual([]);
    expect(notes.join(" ")).toMatch(/temporary or expiring/i);
  });
});

describe("it must not grant higher privileges", () => {
  it("never suggests an administrative role", () => {
    for (const role of ["admin", "owner", "developer"]) {
      const { suggestion, notes } = found(ask(row(), [pos({ role })]));
      expect(suggestion?.role, role).toBeNull();
      expect(suggestion?.scopeLevel, role).toBeNull();
      expect(notes.join(" "), role).toMatch(/administrative or corporate role/);
    }
  });

  it("never suggests global, even when Woven marks all-location access; it says so instead", () => {
    const { suggestion, notes } = found(ask(row({ hasAllLocationAccess: true }), [pos({ scopeLevel: "global" })]));
    expect(suggestion?.scopeLevel).toBe("location");
    expect(notes.join(" ")).toMatch(/all locations/i);
  });

  it("a mapping can narrow a role's reach but never widen it", () => {
    expect(found(ask(row(), [pos({ scopeLevel: "region" })])).suggestion?.scopeLevel).toBe("location");
    const dm = found(ask(row(), [pos({ role: "district_manager", scopeLevel: "location" })]));
    expect(dm.suggestion?.role).toBe("district_manager");
    expect(dm.suggestion?.scopeLevel).toBe("location");
  });

  it("does not guess a district or region primary", () => {
    const { suggestion, notes } = found(ask(row(), [pos({ role: "regional_manager", scopeLevel: "region" })]));
    expect(suggestion?.scopeLevel).toBe("region");
    expect(suggestion?.primaryAreaId).toBeNull();
    expect(notes.join(" ")).toMatch(/choose the region yourself/);
  });

  it("suggests no role for an unconfirmed position or a protected role override", () => {
    for (const p of [pos({ isConfirmed: false }), pos({ status: "unmapped", role: null })]) {
      const { suggestion } = found(ask(row(), [p]));
      expect(suggestion?.role).toBeNull();
      expect(suggestion?.primaryAreaId).toBeNull();
    }
    const overridden = found(ask(row(), [pos()], LOCS, new Set(["E-1"])));
    expect(overridden.suggestion?.role).toBeNull();
    expect(overridden.notes.join(" ")).toMatch(/protected role override/);
  });
});

describe("who gets a suggestion at all", () => {
  it("an unknown email is not found", () => {
    expect(inviteSuggestionForEmail("nobody@example.com", [row()], [pos()], LOCS)).toEqual({ status: "not_found" });
    expect(inviteSuggestionForEmail("  ", [row({ emailAddress: null })], [pos()], LOCS)).toEqual({ status: "not_found" });
  });

  it("two Woven employees sharing the address suggest nothing", () => {
    const r = inviteSuggestionForEmail("kay.rowe@example.com", [row(), row({ id: "d2", externalEmployeeId: "E-2" })], [pos()], LOCS);
    expect(r.status).toBe("ambiguous");
    expect(JSON.stringify(r)).not.toContain("location_manager");
  });

  it("terminated, unread, termination-conflict and other-brand employees get no suggestion", () => {
    for (const r of [
      row({ employmentStatus: "terminated" }),
      row({ missingSyncCount: 2 }),
      row({ dataIssues: ["status_termination_conflict"] }),
      row({ primaryLocationName: "Sun Tan City — Lincoln" }),
    ]) {
      expect(found(ask(r)).suggestion).toBeNull();
    }
  });

  it("reveals no email, Woven id or internal location id", () => {
    const text = JSON.stringify(found(ask(row({ additionalLocations: [{ wovenLocationId: "W-67", name: "Bellevue", number: null }] }))));
    expect(text).not.toContain("kay.rowe@");
    expect(text).not.toContain("E-1");
    expect(text).not.toContain("W-67");
  });
});
