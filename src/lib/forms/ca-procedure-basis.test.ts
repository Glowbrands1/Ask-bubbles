import { afterEach, describe, expect, it, vi } from "vitest";

import { conductHasReason, OFFENSE_BASIS_PROPERTY, offenseBasisProperty, readOffenseBasis } from "./ca-conduct-reason";
import { readCaPolicy } from "./ca-policy";

/**
 * CA_PROCEDURE_BASIS_ENABLED (Pau via QA, 5 Nov 2026, sf-b6; ruling A): the
 * drafting model may name a store procedure as the basis, and an unreasoned
 * Standards of Conduct tick then moves to Other like upkeep. The manager's
 * words are QA's (person invented).
 */
const B6 = "I need a corrective action form for Wynne Sarrow for counting the drawer early and turning away a customer";

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.CA_PROCEDURE_BASIS_ENABLED;
});

describe("the store-procedure basis", () => {
  it("off: the tool is as before and store_procedure is not read", () => {
    // Gate-Bubbles-4 (12 Nov 2026): an off test pins CA_PROCEDURE_BASIS off itself, so it holds with that flag on.
    vi.stubEnv("CA_PROCEDURE_BASIS_ENABLED", "");
    expect(offenseBasisProperty()).toBe(OFFENSE_BASIS_PROPERTY);
    expect(readOffenseBasis({ offense_basis: "store_procedure" })).toBeNull();
    expect(conductHasReason(readCaPolicy(B6), false, "store_procedure")).toBe(true);
  });

  it("on: the tool offers it, it is read, and it is no reason for the Standards of Conduct", () => {
    process.env.CA_PROCEDURE_BASIS_ENABLED = "true";
    expect(offenseBasisProperty().enum).toContain("store_procedure");
    expect(offenseBasisProperty().description).toContain("store_procedure =");
    expect(readOffenseBasis({ offense_basis: "store_procedure" })).toBe("store_procedure");
    expect(conductHasReason(readCaPolicy(B6), false, "store_procedure")).toBe(false);
  });

  it("on: conduct, a stated policy, or no basis keeps the Standards of Conduct", () => {
    process.env.CA_PROCEDURE_BASIS_ENABLED = "true";
    expect(conductHasReason(readCaPolicy("she was rude to a guest"), false, "conduct")).toBe(true);
    expect(conductHasReason(readCaPolicy(B6), true, "store_procedure")).toBe(true);
    expect(conductHasReason(readCaPolicy(B6), false, null)).toBe(true);
  });
});

describe("QA's ruling (a), 12 Nov 2026: a bare \"customer complaint\" is the app's reading", () => {
  it("only a rude_guest topic whose match is the bare phrase counts as bare", async () => {
    const { onlyBareComplaint } = await import("./ca-conduct-reason");
    expect(onlyBareComplaint({ id: "rude_guest", phrase: "customer complaint" })).toBe(true);
    expect(onlyBareComplaint({ id: "rude_guest", phrase: "Customers complained" })).toBe(true);
    expect(onlyBareComplaint({ id: "rude_guest", phrase: "rude to a customer" })).toBe(false);
    expect(onlyBareComplaint({ id: "animals", phrase: "customer complaint" })).toBe(false);
    expect(onlyBareComplaint(null)).toBe(false);
  });
});
