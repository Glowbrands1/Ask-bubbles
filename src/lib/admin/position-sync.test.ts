import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PlannedRow } from "@/lib/employees/woven/access/types";
import type { Role, ScopeLevel } from "@/types";

import { changeNoticeText, decidePositionChanges, MAX_CHANGES_PER_RUN, readPositionSyncConfig } from "./position-sync";
import { runPositionSync, type PositionSyncDeps } from "./position-sync.server";

/*
 * Pau, 28 Nov 2026: "we need to add District manager also, just not corporate , also add a sync where there is a
 * position change it should detect it and give the correct link to the person with correct position and location.
 * sometimes they make new hire DM as tanning employee but change it within the dayy to DM so we need to catch that
 * too, for new positions existing, make sure their access refreshes too depends on the access we have in the
 * intergration both app". Chosen: "All within manager tiers".
 *
 * Invented people only. Store ids are the app's own. The approved mapping gives a District Manager every store.
 */

const SALON_A = "loc-66";
const SALON_B = "loc-67";

function row(over: {
  role: Role;
  level?: ScopeLevel;
  area?: string | null;
  proposedRole: Role | null;
  proposedArea?: string | null;
  status?: "active" | "invited" | "disabled";
  protectedAccount?: boolean;
  linkMethod?: string;
  woven?: "active" | "terminated" | "unknown";
  id?: string;
}): PlannedRow {
  const id = over.id ?? "E1";
  return {
    key: id,
    externalEmployeeId: id,
    appUserId: `u-${id}`,
    employeeName: "Robin Quillfeather",
    emailAddress: "robin@example.com",
    wovenStatus: over.woven ?? "active",
    wovenPosition: null,
    wovenPrimaryLocation: null,
    wovenAdditionalLocations: [],
    account: {
      appUserId: `u-${id}`,
      email: "robin@example.com",
      role: over.role,
      status: over.status ?? "active",
      scopeLevel: over.level ?? "location",
      primaryAreaId: over.area === undefined ? SALON_A : over.area,
      management: "woven_linked",
      isProtected: over.protectedAccount ?? false,
      managed: { status: true, location: false, role: false },
      extraSalonCount: 0,
      via: "link",
      linkMethod: over.linkMethod ?? "admin_manual",
      invite: null,
    },
    proposedRole: over.proposedRole,
    proposedPrimaryAreaId: over.proposedArea === undefined ? SALON_A : over.proposedArea,
    actions: [],
    reasons: [],
    lifecycle: "NO_CHANGE",
    lifecycleReason: "",
    before: null,
    after: null,
    wovenSourceAt: null,
  } as PlannedRow;
}

const decide = (rows: PlannedRow[], also: Record<string, string[]> = {}) =>
  decidePositionChanges(rows, new Map(Object.entries(also).map(([k, v]) => [k, { alsoCoversAreaIds: v }])));

describe("who moves, and to what", () => {
  it("the same-day fix: a new hire made Team Member, corrected to District Manager, becomes a DM of every store", () => {
    const { changes } = decide([row({ role: "employee", proposedRole: "district_manager", linkMethod: "provisioned" })]);
    expect(changes).toEqual([
      expect.objectContaining({
        reason: "position_changed",
        from: { role: "employee", scope: { level: "location", primaryAreaId: SALON_A, alsoCoversAreaIds: [] } },
        to: { role: "district_manager", scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } },
      }),
    ]);
  });

  it("promotions, demotions and moves within the tier", () => {
    const { changes } = decide([
      row({ id: "P", role: "assistant_manager", proposedRole: "location_manager" }),
      row({ id: "D", role: "location_manager", proposedRole: "employee" }),
      row({ id: "M", role: "location_manager", proposedRole: "location_manager", proposedArea: SALON_B }),
      row({ id: "G", role: "district_manager", level: "global", area: null, proposedRole: "location_manager", proposedArea: SALON_B }),
    ]);
    expect(changes.map((c) => [c.externalEmployeeId, c.to.role, c.to.scope.level, c.to.scope.primaryAreaId, c.reason])).toEqual([
      ["P", "location_manager", "location", SALON_A, "position_changed"],
      ["D", "employee", "location", SALON_A, "position_changed"],
      ["M", "location_manager", "location", SALON_B, "location_changed"],
      ["G", "location_manager", "location", SALON_B, "position_changed"],
    ]);
  });

  it("a District Manager an admin gave one store is not widened: that is not a Woven change", () => {
    expect(decide([row({ role: "district_manager", proposedRole: "district_manager" })]).changes).toEqual([]);
  });

  it("extra stores an admin granted stay", () => {
    const { changes } = decide([row({ role: "assistant_manager", proposedRole: "location_manager" })], { "u-E1": ["loc-219"] });
    expect(changes[0].to.scope.alsoCoversAreaIds).toEqual(["loc-219"]);
  });

  it("never: protected or admin accounts, regional or corporate, unmapped positions, non-store locations, people not Active, disabled accounts", () => {
    const { changes, skipped } = decide([
      row({ id: "1", role: "location_manager", proposedRole: "district_manager", protectedAccount: true }),
      row({ id: "2", role: "regional_manager", level: "global", area: null, proposedRole: "location_manager" }),
      row({ id: "3", role: "location_manager", proposedRole: "admin" }),
      row({ id: "4", role: "location_manager", proposedRole: null }),
      row({ id: "5", role: "employee", proposedRole: "location_manager", proposedArea: null }),
      row({ id: "6", role: "location_manager", proposedRole: "employee", woven: "terminated" }),
      row({ id: "7", role: "location_manager", proposedRole: "employee", status: "disabled" }),
    ]);
    expect(changes).toEqual([]);
    expect(skipped.map((s) => s.reason).sort()).toEqual(["new_position_outside_the_tier", "outside_the_tier", "position_not_mapped", "woven_primary_location_not_a_store"]);
  });

  it("the admins' bell says who, from what, to what", () => {
    const [change] = decide([row({ role: "employee", proposedRole: "district_manager", linkMethod: "provisioned" })]).changes;
    expect(changeNoticeText(change)).toEqual({
      title: "Access updated from Woven: Robin Quillfeather",
      body: `Robin Quillfeather's Ask Bubbles access now follows Woven: Team Member (${SALON_A}) → District Manager (every store).`,
    });
  });
});

describe("runPositionSync", () => {
  const ON = { WOVEN_POSITION_SYNC_ENABLED: "true", WOVEN_POSITION_SYNC_ACTOR: "admin@example.com" };
  const plan = (rows: PlannedRow[], mutationsAllowed = true) => ({ rows, guard: { mutationsAllowed } }) as never;
  const deps = (rows: PlannedRow[], over: Partial<PositionSyncDeps> = {}) => {
    const applied: string[] = [];
    const told: number[] = [];
    const d: PositionSyncDeps & { applied: string[]; told: number[] } = {
      applied,
      told,
      actor: vi.fn(async () => ({ id: "admin-id", email: "admin@example.com", role: "admin" as Role })),
      loadPlan: vi.fn(async () => plan(rows)),
      alsoCovers: vi.fn(async () => new Map()),
      apply: vi.fn(async (change) => void applied.push(change.externalEmployeeId)),
      tellAdmins: vi.fn(async (changes) => void told.push(changes.length)),
      ...over,
    };
    return d;
  };

  it("off by default, and without an admin to act as", async () => {
    expect(readPositionSyncConfig({})).toEqual({ enabled: false, actorEmail: null });
    const d = deps([row({ role: "employee", proposedRole: "location_manager" })]);
    expect(await runPositionSync({ env: {} }, d)).toEqual({ status: "off" });
    expect(await runPositionSync({ env: { WOVEN_POSITION_SYNC_ENABLED: "true" } }, d)).toEqual({ status: "off", code: "actor_missing" });
    expect(await runPositionSync({ env: ON }, { ...d, actor: async () => null })).toEqual({ status: "off", code: "actor_not_an_administrator" });
    expect(d.apply).not.toHaveBeenCalled();
  });

  it("applies each change in the admin's name and tells the admins", async () => {
    const d = deps([row({ id: "A", role: "employee", proposedRole: "district_manager", linkMethod: "provisioned" }), row({ id: "B", role: "location_manager", proposedRole: "location_manager" })]);
    expect(await runPositionSync({ env: ON }, d)).toEqual({ status: "completed", applied: 1, failed: 0, skipped: 0 });
    expect(d.applied).toEqual(["A"]);
    expect(d.told).toEqual([1]);
  });

  it("nothing while the guards stop changes, or when more than the cap would change at once", async () => {
    const one = row({ role: "employee", proposedRole: "location_manager" });
    expect(await runPositionSync({ env: ON }, deps([one], { loadPlan: async () => plan([one], false) }))).toEqual({ status: "blocked", code: "guards" });
    const many = Array.from({ length: MAX_CHANGES_PER_RUN + 1 }, (_, i) => row({ id: `E${i}`, role: "employee", proposedRole: "location_manager" }));
    const d = deps(many);
    expect(await runPositionSync({ env: ON }, d)).toEqual({ status: "blocked", code: "too_many_changes", changes: MAX_CHANGES_PER_RUN + 1 });
    expect(d.apply).not.toHaveBeenCalled();
  });

  it("never changes the admin it acts as; a refused change is counted, the rest go on", async () => {
    const self = { ...row({ id: "S", role: "employee", proposedRole: "location_manager" }) };
    self.account = { ...self.account!, appUserId: "admin-id" };
    const d = deps([self, row({ id: "F", role: "employee", proposedRole: "location_manager" }), row({ id: "K", role: "employee", proposedRole: "location_manager" })], {
      apply: vi.fn(async (change) => {
        if (change.externalEmployeeId === "F") throw new Error("refused");
      }),
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await runPositionSync({ env: ON }, d)).toEqual({ status: "completed", applied: 1, failed: 1, skipped: 0 });
    errors.mockRestore();
  });
});
