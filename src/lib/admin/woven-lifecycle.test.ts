import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PlannedRow } from "@/lib/employees/woven/access/types";
import type { Role } from "@/types";

import { decideLifecycle, readLifecycleConfig } from "./woven-lifecycle";
import { runAccountLifecycle, type LifecycleDeps } from "./woven-lifecycle.server";

/*
 * Pau, 28 Nov 2026: "need lifecycle in bubble too" — link an existing account by its one exact email match, as the
 * sibling app's lifecycle does. Invented people only.
 *
 * Changed on purpose (28 Nov 2026): this module no longer turns off a Terminated person's sign-in. That is the access
 * sync's apply step (src/lib/employees/woven/access/apply.ts, merged in #1212), which re-checks under row locks and
 * records each run; running both would disable twice. The link has its own switch, WOVEN_LINK_EXISTING_ENABLED, because
 * the apply step turns itself off when WOVEN_ACCESS_APPLY_ACTIONS names anything it does not apply.
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

const ON = { WOVEN_LINK_EXISTING_ENABLED: "true" };

describe("the switch", () => {
  it("off by default; only \"true\" turns it on; WOVEN_ACCESS_APPLY_ACTIONS is not read", () => {
    expect(readLifecycleConfig({})).toEqual({ linkExisting: false });
    expect(readLifecycleConfig({ WOVEN_LINK_EXISTING_ENABLED: "yes" })).toEqual({ linkExisting: false });
    expect(readLifecycleConfig({ WOVEN_LINK_EXISTING_ENABLED: " TRUE " })).toEqual({ linkExisting: true });
    expect(readLifecycleConfig({ WOVEN_ACCESS_APPLY_ACTIONS: "LINK_EXISTING,DISABLE_TERMINATED" })).toEqual({ linkExisting: false });
  });
});

describe("what the lifecycle applies", () => {
  it("never turns off a sign-in: a terminated row is left to the access sync's apply step", () => {
    const d = decideLifecycle([row({ id: "T1", actions: ["DISABLE_TERMINATED"], via: "link", woven: "terminated" })], readLifecycleConfig(ON), "test");
    expect(d).toEqual({ links: [] });
  });

  it("links the one exact email match as email_discovery; status managed only for a GM/AGM in a GM/AGM position", () => {
    const d = decideLifecycle(
      [
        row({ id: "L1", actions: ["FLAG_LINK_REVIEW"] }),
        row({ id: "L2", actions: ["FLAG_LINK_REVIEW"], role: "district_manager", scopeLevel: "global", proposedRole: "district_manager" }),
      ],
      readLifecycleConfig(ON),
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
      readLifecycleConfig(ON),
      "test",
    );
    expect(d.links).toEqual([]);
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
      link: vi.fn(async (r) => void done.push(`link:${r.app_user_id}`)),
      ...over,
    };
    return d;
  };
  const rows = [row({ id: "T1", actions: ["DISABLE_TERMINATED"], via: "link", woven: "terminated" }), row({ id: "L1", actions: ["FLAG_LINK_REVIEW"] })];

  it("off by default, and without an admin to act as", async () => {
    const d = deps(rows);
    expect(await runAccountLifecycle({ env: {} }, d)).toEqual({ status: "off" });
    expect(await runAccountLifecycle({ env: ON }, d)).toEqual({ status: "off", code: "actor_missing" });
    expect(await runAccountLifecycle({ env: { ...ON, ...ACTOR } }, { ...d, actor: async () => null })).toEqual({ status: "off", code: "actor_not_an_administrator" });
    expect(d.done).toEqual([]);
  });

  it("links in the admin's name, and turns nobody off", async () => {
    const d = deps(rows);
    expect(await runAccountLifecycle({ env: { ...ON, ...ACTOR } }, d)).toEqual({ status: "completed", linked: 1, failed: 0 });
    expect(d.done).toEqual(["link:u-L1"]);
  });

  it("nothing while the guards stop changes", async () => {
    const d = deps(rows, { loadPlan: async () => ({ rows, guard: { mutationsAllowed: false } }) as never });
    expect(await runAccountLifecycle({ env: { ...ON, ...ACTOR } }, d)).toEqual({ status: "blocked", code: "guards" });
    expect(d.done).toEqual([]);
  });
});
