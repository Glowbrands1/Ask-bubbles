import { afterEach, describe, expect, it, vi } from "vitest";

import { rosterNames } from "../store-alias";
import { checkReading, type CheckContext } from "./check";
import { parseFormReading } from "./schema";

/* REASON_PLACE_NEVER_STORE (QA's Bubbles 17z live bug, 14 Nov 2026), the tester's wording; invented person. */
afterEach(() => vi.unstubAllEnvs());
const on = (value: boolean) => {
  vi.stubEnv("REASON_PLACE_NOT_STORE_ENABLED", "true");
  vi.stubEnv("STORE_ALIAS_ENABLED", "true");
  vi.stubEnv("REASON_PLACE_NEVER_STORE_ENABLED", value ? "true" : "");
};

const TURN = "write a CA for tavia quellan, she was late because she was at kearney";
const context = (turn: string): CheckContext => ({
  managerTurns: [turn],
  people: [],
  locations: [
    { id: "loc-66", name: "Kearney, NE" },
    { id: "loc-264", name: "Omaha, NE (West Dodge Rd)" },
  ],
  headings: [],
  today: "2026-11-14",
});
const readLocation = (turn: string) =>
  checkReading(parseFormReading({ location: { value: "kearney", evidence: turn } })!, context(turn)).location?.id ?? null;

describe("REASON_PLACE_NEVER_STORE", () => {
  it("off: the AI reader's reading of a reason's place is the store, and the alias pass rewrites it (the defect)", () => {
    on(false);
    expect(readLocation(TURN)).toBe("loc-66");
    expect(rosterNames(TURN)).not.toBe(TURN);
  });

  it("on: a reason's place is never the reader's store, and its words stay as typed", () => {
    on(true);
    expect(readLocation(TURN)).toBeNull();
    expect(rosterNames(TURN)).toBe(TURN);
  });

  it("on: a store said as the store is still read", () => {
    on(true);
    expect(readLocation("write a CA for tavia quellan, she was late at kearney")).toBe("loc-66");
    expect(readLocation("write a CA for tavia quellan at kearney, she was late because she was at kearney")).toBe("loc-66");
  });
});
