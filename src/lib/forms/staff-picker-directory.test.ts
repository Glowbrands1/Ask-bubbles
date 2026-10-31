import { describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";

/**
 * ============================================================================
 * THE WHOLE-STAFF LIST THROUGH THE REAL DIRECTORY READ (review item 11)
 * ============================================================================
 *
 * The chat e2e mocks the roster; this runs the real `loadScopedRoster` over the
 * three tables it reads — the Woven directory, its active affiliations and the
 * reviewed location map — so the position join and the store scope are what
 * production does. People are invented.
 */

const store = {
  employee_access_directory: [
    { id: "p-1", first_name: "Marnie", last_name: "Holloway", preferred_first_name: null, employment_status: "active", position_name: "Team Member Part Time", last_synced_at: null },
    { id: "p-2", first_name: "Remy", last_name: "Calder", preferred_first_name: null, employment_status: "active", position_name: "General Manager", last_synced_at: null },
    { id: "p-3", first_name: "Tobin", last_name: "Areli", preferred_first_name: null, employment_status: "active", position_name: "Team Member Part Time", last_synced_at: null },
    { id: "p-4", first_name: "Wren", last_name: "Galloway", preferred_first_name: null, employment_status: "terminated", position_name: "Team Member Part Time", last_synced_at: null },
  ],
  employee_location_affiliations: [
    { employee_id: "p-1", woven_location_id: "w-66", active: true },
    { employee_id: "p-2", woven_location_id: "w-66", active: true },
    { employee_id: "p-3", woven_location_id: "w-67", active: true },
    { employee_id: "p-4", woven_location_id: "w-66", active: true },
  ],
  woven_location_map: [
    { woven_location_id: "w-66", location_id: "loc-66", status: "mapped" },
    { woven_location_id: "w-67", location_id: "loc-67", status: "mapped" },
  ],
} as unknown as FakeStore;

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));

const { staffPickerTurn } = await import("./staff-picker");

describe("the whole-staff list, real directory read", () => {
  it("a store account: its own store's current staff, under Woven's position", async () => {
    const reply = await staffPickerTurn({
      question: "can you create a coaching form for my whole staff?",
      history: [],
      continuing: false,
      scope: { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] } as never,
      role: "location_manager",
    });
    const content = reply?.content ?? "";
    expect(content).toContain("**Kearney, NE**");
    expect(content).toMatch(/\*\*General Manager\*\*\n- Remy Calder/);
    expect(content).toMatch(/\*\*Team Member Part Time\*\*\n- Marnie Holloway/);
    expect(content).not.toContain("Tobin Areli");
    expect(content).not.toContain("Wren Galloway");
  });
});
