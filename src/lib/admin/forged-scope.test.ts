import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessScope } from "@/types";

/**
 * FORGED REQUESTS. The browser is not a boundary, so these call the SERVER
 * functions directly with scopes the form would never send, as an administrator
 * whose reach is one location. Containment must refuse before the privileged
 * client writes anything — asserted by recording every call it receives.
 */

const calls: string[] = [];
let before: Record<string, unknown> | null = null;

function chain(table: string): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const m of ["select", "eq", "ilike", "in", "order", "limit", "not", "neq"]) c[m] = self;
  c.maybeSingle = async () => ({ data: before, error: null });
  c.single = async () => ({ data: before, error: null });
  c.insert = () => {
    calls.push(`${table}.insert`);
    return c;
  };
  c.update = () => {
    calls.push(`${table}.update`);
    return c;
  };
  c.then = (resolve: (r: unknown) => unknown) => resolve({ data: [], error: null, count: 0 });
  return c;
}

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => chain(table),
    auth: {
      admin: {
        inviteUserByEmail: async () => {
          calls.push("auth.invite");
          return { data: { user: { id: "new-user" } }, error: null };
        },
        deleteUser: async () => ({}),
      },
    },
  }),
}));

const { inviteUser, patchUser, DirectoryError } = await import("./user-directory");

const ACTOR_SCOPE: AccessScope = { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] };
const actor = (scope: AccessScope | undefined = ACTOR_SCOPE) => ({ id: "admin-1", email: "a@x.test", role: "admin" as const, scope });
const invite = (scope: unknown, a = actor()) =>
  inviteUser({ email: "new@example.test", displayName: "New", role: "employee", scope, redirectTo: "https://x.test/auth" }, a);

beforeEach(() => {
  calls.length = 0;
  before = {
    id: "user-1",
    email: "u@example.test",
    display_name: "U",
    role: "employee",
    status: "active",
    scope_level: "location",
    scope_primary_area_id: "loc-66",
    scope_also_covers_area_ids: [],
    created_at: "",
    updated_at: "",
  };
});

describe("creating an invitation with a forged scope", () => {
  it.each([
    ["a primary outside the administrator's reach", { level: "location", primaryAreaId: "loc-338", alsoCoversAreaIds: [] }],
    ["an additional location outside their reach", { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: ["loc-338"] }],
    ["a global scope", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] }],
    ["an area that resolves to no location", { level: "district", primaryAreaId: "dist-anything", alsoCoversAreaIds: [] }],
  ])("refuses %s and creates nothing", async (_label, scope) => {
    await expect(invite(scope)).rejects.toMatchObject({ code: expect.stringMatching(/forbidden_grant|invalid_input/) });
    expect(calls).toEqual([]);
  });

  it("refuses everything when the administrator's own scope is unknown", async () => {
    await expect(invite({ level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] }, actor(null as never))).rejects.toBeInstanceOf(DirectoryError);
    expect(calls).toEqual([]);
  });

  it("allows an in-reach invitation, and a global administrator may invite anywhere or global", async () => {
    before = null;
    await expect(invite({ level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] })).resolves.toBeDefined().catch(() => undefined);
    expect(calls).toContain("auth.invite");
    calls.length = 0;
    const global: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
    for (const scope of [
      { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] },
      { level: "location", primaryAreaId: "loc-338", alsoCoversAreaIds: ["loc-219"] },
    ]) {
      calls.length = 0;
      await invite(scope, actor(global)).catch(() => undefined);
      expect(calls, JSON.stringify(scope)).toContain("auth.invite");
    }
  });
});

describe("editing an existing user with a forged scope", () => {
  it.each([
    ["a primary outside reach", { level: "location", primaryAreaId: "loc-338", alsoCoversAreaIds: [] }],
    ["an added location outside reach", { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: ["loc-338"] }],
    ["a global scope", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] }],
  ])("refuses %s and writes nothing", async (_label, scope) => {
    await expect(patchUser("user-1", { scope }, actor())).rejects.toMatchObject({ code: "forbidden_grant" });
    expect(calls).toEqual([]);
  });

  it("does not block an unrelated edit, or removing a location outside the administrator's reach", async () => {
    before = { ...before!, scope_primary_area_id: "loc-338", scope_also_covers_area_ids: ["loc-219", "loc-264"] };
    // Same scope resubmitted (e.g. a form that sends it back unchanged).
    await patchUser("user-1", { scope: { level: "location", primaryAreaId: "loc-338", alsoCoversAreaIds: ["loc-219", "loc-264"] } }, actor()).catch(() => undefined);
    expect(calls).toContain("app_users.update");
    calls.length = 0;
    // Removal only.
    await patchUser("user-1", { scope: { level: "location", primaryAreaId: "loc-338", alsoCoversAreaIds: ["loc-219"] } }, actor()).catch(() => undefined);
    expect(calls).toContain("app_users.update");
  });

  it("a global administrator may still re-scope anyone", async () => {
    const global: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
    await patchUser("user-1", { scope: { level: "location", primaryAreaId: "loc-338", alsoCoversAreaIds: ["loc-219"] } }, actor(global)).catch(() => undefined);
    expect(calls).toContain("app_users.update");
  });
});
