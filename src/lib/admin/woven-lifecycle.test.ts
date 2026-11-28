import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PlannedRow } from "@/lib/employees/woven/access/types";
import type { Role } from "@/types";

import { decideLifecycle, readLifecycleConfig } from "./woven-lifecycle";
import { runAccountLifecycle, type LifecycleDeps } from "./woven-lifecycle.server";

/*
 * Pau, 28 Nov 2026: "need lifecycle in bubble too" — link an existing account by its one exact email match, and turn
 * off the sign-in of someone Woven marks Terminated, as Ask Sunny's lifecycle does. Invented people only.
 */

function row(over: {
  id?: string;
  actions: string[];
  role?: Role;
  scopeLevel?: string;
  status?: "active" | "invited" | "disabled";
  isProtected?: boolean;
  via?: "link" | "email_candidate" | "account_only";
  woven?: "active" | "terminated" | "unknown";
  proposedRole?: Role | null;
}): PlannedRow {
  const id = over.id ?? "E1";
  return {
    key: `employee:${id}`,
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
      role: over.role ?? "location_manager",
      status: over.status ?? "active",
      scopeLevel: over.scopeLevel ?? "location",
      primaryAreaId: "loc-66",
      management: null,
      isProtected: over.isProtected ?? false,
      via: over.via ?? "email_candidate",
    },
    proposedRole: over.proposedRole === undefined ? "location_manager" : over.proposedRole,
    proposedPrimaryAreaId: "loc-66",
    actions: over.actions,
    reasons: [],
    before: null,
    after: null,
  } as unknown as PlannedRow;
}

const BOTH = { WOVEN_ACCESS_APPLY_ACTIONS: "LINK_EXISTING, DISABLE_TERMINATED" };

describe("the switch", () => {
  it("off by default; names Ask Sunny's actions; anything else is ignored and reported", () => {
    expect(readLifecycleConfig({})).toEqual({ actions: [], ignored: [] });
    expect(readLifecycleConfig({ WOVEN_ACCESS_APPLY_ACTIONS: "disable_terminated,CREATE_USER,UPDATE_ROLE" })).toEqual({
      actions: ["DISABLE_TERMINATED"],
      ignored: ["CREATE_USER", "UPDATE_ROLE"],
    });
  });
});

describe("what the lifecycle applies", () => {
  it("turns off the sign-in the planner proposes for a terminated, linked account; never protected or already disabled", () => {
    const d = decideLifecycle(
      [
        row({ id: "T1", actions: ["DISABLE_TERMINATED"], via: "link", woven: "terminated" }),
        row({ id: "T2", actions: ["DISABLE_TERMINATED"], via: "link", woven: "terminated", status: "disabled" }),
        row({ id: "T3", actions: ["DISABLE_TERMINATED"], via: "link", woven: "terminated", isProtected: true }),
      ],
      readLifecycleConfig(BOTH),
      "test",
    );
    expect(d.disables).toEqual([{ appUserId: "u-T1", externalEmployeeId: "T1" }]);
  });

  it("links the one exact email match as email_discovery; status managed only for a GM/AGM in a GM/AGM position", () => {
    const d = decideLifecycle(
      [
        row({ id: "L1", actions: ["FLAG_LINK_REVIEW"] }),
        row({ id: "L2", actions: ["FLAG_LINK_REVIEW"], role: "district_manager", scopeLevel: "global", proposedRole: "district_manager" }),
      ],
      readLifecycleConfig(BOTH),
      "woven-lifecycle:admin@example.com",
    );
    expect(d.links).toEqual([
      expect.objectContaining({ app_user_id: "u-L1", external_employee_id: "L1", link_method: "email_discovery", managed_status: true, managed_location: false, managed_role: false }),
      expect.objectContaining({ app_user_id: "u-L2", managed_status: false }),
    ]);
  });

  it("never links someone not Active, a protected or disabled account, or a row in doubt", () => {
    const d = decideLifecycle(
      [
        row({ id: "A", actions: ["FLAG_LINK_REVIEW"], woven: "terminated" }),
        row({ id: "B", actions: ["FLAG_LINK_REVIEW"], isProtected: true }),
        row({ id: "C", actions: ["FLAG_LINK_REVIEW"], status: "disabled" }),
        row({ id: "D", actions: ["FLAG_LINK_REVIEW", "FLAG_DUPLICATE_EMAIL"] }),
      ],
      readLifecycleConfig(BOTH),
      "test",
    );
    expect(d.links).toEqual([]);
  });

  it("only the actions named", () => {
    const rows = [row({ id: "T1", actions: ["DISABLE_TERMINATED"], via: "link", woven: "terminated" }), row({ id: "L1", actions: ["FLAG_LINK_REVIEW"] })];
    expect(decideLifecycle(rows, readLifecycleConfig({ WOVEN_ACCESS_APPLY_ACTIONS: "LINK_EXISTING" }), "t")).toMatchObject({ disables: [], links: [{ app_user_id: "u-L1" }] });
    expect(decideLifecycle(rows, readLifecycleConfig({ WOVEN_ACCESS_APPLY_ACTIONS: "DISABLE_TERMINATED" }), "t")).toMatchObject({ disables: [{ appUserId: "u-T1" }], links: [] });
  });
});

describe("runAccountLifecycle", () => {
  const ACTOR = { WOVEN_POSITION_SYNC_ACTOR: "admin@example.com" };
  const deps = (rows: PlannedRow[], over: Partial<LifecycleDeps> = {}) => {
    const done: string[] = [];
    const d: LifecycleDeps & { done: string[] } = {
      done,
      actor: vi.fn(async () => ({ id: "admin-id", email: "admin@example.com", role: "admin" as Role })),
      loadPlan: vi.fn(async () => ({ rows, guard: { mutationsAllowed: true } }) as never),
      disable: vi.fn(async (id: string) => void done.push(`disable:${id}`)),
      link: vi.fn(async (r) => void done.push(`link:${r.app_user_id}`)),
      ...over,
    };
    return d;
  };
  const rows = [row({ id: "T1", actions: ["DISABLE_TERMINATED"], via: "link", woven: "terminated" }), row({ id: "L1", actions: ["FLAG_LINK_REVIEW"] })];

  it("off by default, and without an admin to act as", async () => {
    const d = deps(rows);
    expect(await runAccountLifecycle({ env: {} }, d)).toEqual({ status: "off" });
    expect(await runAccountLifecycle({ env: BOTH }, d)).toEqual({ status: "off", code: "actor_missing" });
    expect(await runAccountLifecycle({ env: { ...BOTH, ...ACTOR } }, { ...d, actor: async () => null })).toEqual({ status: "off", code: "actor_not_an_administrator" });
    expect(d.done).toEqual([]);
  });

  it("applies the disables and links in the admin's name", async () => {
    const d = deps(rows);
    expect(await runAccountLifecycle({ env: { ...BOTH, ...ACTOR } }, d)).toEqual({ status: "completed", disabled: 1, linked: 1, failed: 0 });
    expect(d.done).toEqual(["disable:u-T1", "link:u-L1"]);
  });

  it("nothing while the guards stop changes", async () => {
    const d = deps(rows, { loadPlan: async () => ({ rows, guard: { mutationsAllowed: false } }) as never });
    expect(await runAccountLifecycle({ env: { ...BOTH, ...ACTOR } }, d)).toEqual({ status: "blocked", code: "guards" });
    expect(d.done).toEqual([]);
  });
});
