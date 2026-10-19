import { describe, expect, it } from "vitest";

import type { RosterEmployee } from "./employee-match";
import { STALE_AFTER_MS, unverifiedWithoutRecord, verifyEmployee } from "./employee-verification";

const NOW = Date.parse("2026-10-19T12:00:00Z");
const fresh = new Date(NOW - 60 * 60 * 1000).toISOString();

const sarah = (overrides: Partial<RosterEmployee> = {}): RosterEmployee => ({
  id: "emp-1",
  firstName: "Sarah",
  lastName: "Miller",
  locationIds: ["loc-236"],
  positionName: "Production Associate",
  employmentStatus: "active",
  lastSyncedAt: fresh,
  ...overrides,
});

const label = (id: string) => ({ "loc-236": "Grand Island, NE (Store 236)", "loc-67": "Bellevue, NE (Store 67)" })[id] ?? id;

describe("a job title comes from Woven or from nowhere", () => {
  it("verifies a current active employee and uses Woven's title", () => {
    const { verification, note } = verifyEmployee({ employee: sarah(), now: NOW });
    expect(verification).toMatchObject({ status: "verified", title: "Production Associate", storeIds: ["loc-236"] });
    expect(note).toBeNull();
  });

  it("uses Woven's title over the manager's wording, and says so", () => {
    const { verification, note } = verifyEmployee({ employee: sarah(), managerTitle: "Shift Lead", now: NOW });
    expect(verification.title).toBe("Production Associate");
    expect(note).toContain("Shift Lead");
    expect(note).toContain("**Production Associate**");
  });

  it("is quiet when the manager's wording agrees, whatever its case or punctuation", () => {
    expect(verifyEmployee({ employee: sarah(), managerTitle: "production  associate", now: NOW }).note).toBeNull();
  });

  it("never fabricates a title when Woven has none", () => {
    const { verification, note } = verifyEmployee({ employee: sarah({ positionName: null }), managerTitle: "Shift Lead", now: NOW });
    expect(verification).toMatchObject({ status: "unverified", title: null, reason: "no_title" });
    expect(note).toContain("Woven has no job title");
    expect(note).toContain("not one from Woven");
  });

  it("does not trust a record the sync has not refreshed", () => {
    const old = new Date(NOW - STALE_AFTER_MS - 1000).toISOString();
    const { verification, note } = verifyEmployee({ employee: sarah({ lastSyncedAt: old }), now: NOW });
    expect(verification).toMatchObject({ status: "unverified", title: null, reason: "stale" });
    expect(note).toContain("hasn't been refreshed");
    expect(verifyEmployee({ employee: sarah({ lastSyncedAt: null }), now: NOW }).verification.reason).toBe("stale");
  });

  it("does not verify a terminated employee", () => {
    const { verification } = verifyEmployee({ employee: sarah({ employmentStatus: "terminated" }), now: NOW });
    expect(verification).toMatchObject({ status: "unverified", reason: "not_active", title: null });
  });

  it("treats an unresolved Woven status as employed, as the sync does", () => {
    expect(verifyEmployee({ employee: sarah({ employmentStatus: "unknown" }), now: NOW }).verification.status).toBe("verified");
  });
});

describe("12. the employee and the store do not match", () => {
  it("surfaces it, naming both, and still verifies the person", () => {
    const { verification, note } = verifyEmployee({ employee: sarah(), namedStoreIds: ["loc-67"], storeLabel: label, now: NOW });
    expect(verification).toMatchObject({ status: "verified", storeMismatch: true });
    expect(note).toContain("Grand Island, NE (Store 236)");
    expect(note).toContain("Bellevue, NE (Store 67)");
    expect(note).toContain("check that it's the right one");
  });

  it("is quiet when the named store is one of theirs, or none was named", () => {
    expect(verifyEmployee({ employee: sarah(), namedStoreIds: ["loc-236"], now: NOW }).verification.storeMismatch).toBeUndefined();
    expect(verifyEmployee({ employee: sarah(), now: NOW }).verification.storeMismatch).toBeUndefined();
  });

  it("says nothing about a store Woven has no mapped assignment for", () => {
    expect(verifyEmployee({ employee: sarah({ locationIds: [] }), namedStoreIds: ["loc-67"], now: NOW }).verification.storeMismatch).toBeUndefined();
  });
});

describe("10 and 11. nothing to verify against", () => {
  it("says no match was found", () => {
    const { verification, note } = unverifiedWithoutRecord("not_found", "Zelda Quinn");
    expect(verification).toEqual({ status: "unverified", title: null, reason: "not_found" });
    expect(note).toContain("couldn't verify **Zelda Quinn** in Woven");
  });

  it("says Woven was unavailable and that nothing was filled in from it", () => {
    const { verification, note } = unverifiedWithoutRecord("unavailable", "Sarah Miller");
    expect(verification).toMatchObject({ status: "unverified", reason: "unavailable", title: null });
    expect(note).toContain("couldn't reach the Woven employee records");
    expect(note).toContain("Nothing has been filled in from Woven");
  });
});
