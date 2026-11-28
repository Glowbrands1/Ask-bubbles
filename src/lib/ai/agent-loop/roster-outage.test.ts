import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * E1 (owner's review, 28 Nov 2026): "When the roster/staff read fails (error or timeout), the chat tells the manager the
 * person isn't on the staff list." The scoped roster reader never throws, so an outage was read as an empty roster.
 * find_staff now reads the read's outcome: an outage, an error or no answer in time is "the staff list could not be
 * checked", never not_on_roster. Invented names; the store is the pack's.
 */
const read = vi.hoisted(() => ({ result: null as null | (() => Promise<unknown>) }));
vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    loadScopedRoster: async () => [],
    loadScopedRosterResult: async () => (read.result ? read.result() : { status: "unavailable" }),
  };
});

import { findStaff, ROSTER_READ_BUDGET_MS, type ToolContext } from "./tools";

const context = {
  actor: { scope: { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] } },
  question: "write up Tamsin Ferrow for being late again today",
  history: [],
  scopeId: "scope",
  today: "2026-11-28",
} as unknown as ToolContext;

describe("find_staff during a staff-list outage (E1)", () => {
  afterEach(() => {
    read.result = null;
    vi.useRealTimers();
  });

  it("an unavailable directory is 'could not be checked', never not_on_roster", async () => {
    read.result = async () => ({ status: "unavailable" });
    const result = await findStaff(context, { name: "Tamsin Ferrow" });
    expect(result.reason_code).toBe("roster_failed");
    expect(String(result.error)).toMatch(/staff list could not be checked/i);
    expect(result).not.toHaveProperty("not_on_roster");
  });

  it("a read that throws is the same", async () => {
    read.result = async () => {
      throw new Error("connection reset");
    };
    expect((await findStaff(context, { name: "Tamsin Ferrow" })).reason_code).toBe("roster_failed");
  });

  it("a read with no answer in time (a timeout) is the same", async () => {
    vi.useFakeTimers();
    read.result = () => new Promise(() => {});
    const pending = findStaff(context, { name: "Tamsin Ferrow" });
    await vi.advanceTimersByTimeAsync(ROSTER_READ_BUDGET_MS + 10);
    expect((await pending).reason_code).toBe("roster_failed");
  });

  it("a roster that loads and lacks the name is still not_on_roster", async () => {
    read.result = async () => ({ status: "ok", roster: [{ id: "e-2", firstName: "Odell", lastName: "Brisk", preferredFirstName: null, locationIds: ["loc-264"] }] });
    expect((await findStaff(context, { name: "Tamsin Ferrow" })).reason_code).toBe("not_on_roster");
  });
});

describe("a district or region whose area names no store (E1, the same outcome reading)", () => {
  it("is unchecked: the name is used as typed, never not_on_roster", async () => {
    read.result = async () => ({ status: "not_checked", reason: "area_scope" });
    const result = await findStaff(context, { name: "Tamsin Ferrow" });
    expect(result).toMatchObject({ unchecked: true });
    expect(result).not.toHaveProperty("not_on_roster");
  });
});
