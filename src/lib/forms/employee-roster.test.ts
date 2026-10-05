import { describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";

/**
 * THE DIRECTORY READ: Woven people, their active affiliations, and the
 * location map a PERSON reviewed — which maps each Woven location to the
 * `loc-<code>` id every Ask Bubbles scope uses. An unmapped Woven location is
 * no location at all.
 */

const store = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  employee_access_directory: [
    { id: "p-1", first_name: "Kai", last_name: "Morgan", preferred_first_name: null, employment_status: "active" },
    { id: "p-2", first_name: "Avery", last_name: "Stone", preferred_first_name: "Ave", employment_status: "active" },
    { id: "p-3", first_name: "Gone", last_name: "Person", preferred_first_name: null, employment_status: "terminated" },
  ],
  employee_location_affiliations: [
    { employee_id: "p-1", woven_location_id: "w-310", active: true },
    { employee_id: "p-2", woven_location_id: "w-310", active: true },
    { employee_id: "p-2", woven_location_id: "w-311", active: true },
    // Ended, so not a current assignment.
    { employee_id: "p-1", woven_location_id: "w-311", active: false },
    // Mapped by nobody yet.
    { employee_id: "p-2", woven_location_id: "w-unmapped", active: true },
    { employee_id: "p-3", woven_location_id: "w-310", active: true },
  ],
  woven_location_map: [
    { woven_location_id: "w-310", location_id: "loc-0310", status: "mapped" },
    { woven_location_id: "w-311", location_id: "loc-0311", status: "mapped" },
    { woven_location_id: "w-unmapped", location_id: null, status: "unmapped" },
    // A mapping that does not name an Ask Bubbles location id is no location.
    { woven_location_id: "w-310", location_id: "s-legacy", status: "mapped" },
  ],
} as unknown as FakeStore;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));

const { loadScopedRoster, readDirectoryRoster } = await import("./employee-roster");

describe("reading the employee directory", () => {
  it("joins people to Ask Bubbles locations through the reviewed location map only", async () => {
    const rows = await readDirectoryRoster();
    const byId = Object.fromEntries(rows.map((row) => [row.id, row.locationIds]));
    expect(byId["p-1"]).toEqual(["loc-0310"]);
    expect(byId["p-2"]).toEqual(["loc-0310", "loc-0311"]);
  });

  it("scopes to the actor before anything leaves the server", async () => {
    const roster = await loadScopedRoster({ level: "location", primaryAreaId: "loc-0311", alsoCoversAreaIds: [] });
    expect(roster.map((entry) => entry.id)).toEqual(["p-2"]);
    expect(roster[0]!.locationIds).toEqual(["loc-0311"]);
  });

  it("fails to an empty roster, never to everyone, when the directory cannot be read", async () => {
    const tables = store as unknown as Record<string, unknown>;
    const saved = tables.woven_location_map;
    delete tables.woven_location_map;
    try {
      expect(await loadScopedRoster({ level: "global", primaryAreaId: null, alsoCoversAreaIds: [] })).toEqual([]);
    } finally {
      tables.woven_location_map = saved;
    }
  });
});
