import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ existing: null as unknown, createUser: vi.fn(), insert: vi.fn(), deleteUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ ilike: () => ({ maybeSingle: async () => ({ data: state.existing }) }) }),
      insert: state.insert,
    }),
    auth: { admin: { createUser: state.createUser, deleteUser: state.deleteUser } },
  }),
}));
vi.mock("@/lib/admin/user-directory", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin/user-directory")>()),
  audit: vi.fn(async () => {}),
  readUser: vi.fn(async (id: string) => ({ id })),
}));

import { createAccountWithoutEmail } from "./create-account";

const G = { level: "global" as const, primaryAreaId: null, alsoCoversAreaIds: [] as string[] };
const actor = { id: "a", email: "admin@x.com", role: "admin" as const, scope: G };
const owner = { ...actor, role: "owner" as const };
const locAdmin = { ...actor, scope: { level: "location" as const, primaryAreaId: "loc-66", alsoCoversAreaIds: ["loc-67"] } };
const input = { email: "Jo@Example.com", displayName: "Jo", role: "employee", scope: { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] } };

beforeEach(() => {
  state.existing = null;
  state.createUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  state.insert.mockReset().mockResolvedValue({ error: null });
  state.deleteUser.mockReset().mockResolvedValue({});
});

describe("createAccountWithoutEmail", () => {
  it("creates a password-less, confirmed credential and an disabled (unusable) location-scoped profile; sends nothing", async () => {
    await createAccountWithoutEmail(input, actor);
    expect(state.createUser).toHaveBeenCalledWith({ email: "jo@example.com", email_confirm: true });
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ role: "employee", status: "disabled", scope_level: "location", scope_primary_area_id: "loc-66" }));
    const code = readFileSync("src/lib/admin/create-account.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/inviteUserByEmail|resetPasswordForEmail|generateLink|password\s*[:=]/);
  });
  it("refuses a duplicate email without touching Auth", async () => {
    state.existing = { id: "x" };
    await expect(createAccountWithoutEmail(input, actor)).rejects.toMatchObject({ code: "duplicate_email" });
    expect(state.createUser).not.toHaveBeenCalled();
  });
  it("creates an Admin only with explicit confirmation", async () => {
    await expect(createAccountWithoutEmail({ ...input, role: "admin" }, actor)).rejects.toMatchObject({ code: "invalid_input" });
    expect(state.createUser).not.toHaveBeenCalled();
    await createAccountWithoutEmail({ ...input, role: "admin", confirmAdmin: true }, actor);
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ role: "admin", status: "disabled" }));
  });
  it.each(["owner", "developer"])("an admin cannot grant %s; an owner can", async (role) => {
    await expect(createAccountWithoutEmail({ ...input, role, confirmAdmin: true }, actor)).rejects.toMatchObject({ code: "forbidden_grant" });
    expect(state.createUser).not.toHaveBeenCalled();
    await createAccountWithoutEmail({ ...input, role, confirmAdmin: true }, owner);
    expect(state.createUser).toHaveBeenCalled();
  });
  it("All Locations is its own scope: a global actor may grant it to a non-admin, a location-scoped actor may not", async () => {
    const all = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
    await createAccountWithoutEmail({ ...input, scope: all }, actor);
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ role: "employee", scope_level: "global" }));
    state.createUser.mockClear();
    await expect(createAccountWithoutEmail({ ...input, scope: all }, locAdmin)).rejects.toMatchObject({ code: "forbidden_grant" });
    expect(state.createUser).not.toHaveBeenCalled();
  });
  it("multi-location: allowed inside the actor's own locations, refused outside", async () => {
    const two = { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: ["loc-67"] };
    await createAccountWithoutEmail({ ...input, scope: two }, locAdmin);
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ scope_primary_area_id: "loc-66", scope_also_covers_area_ids: ["loc-67"] }));
    state.createUser.mockClear();
    const outside = { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: ["loc-219"] };
    await expect(createAccountWithoutEmail({ ...input, scope: outside }, locAdmin)).rejects.toMatchObject({ code: "forbidden_grant" });
    expect(state.createUser).not.toHaveBeenCalled();
  });
  it("refuses district scope and locations that are not on the roster", async () => {
    for (const scope of [
      { level: "district", primaryAreaId: "dist-1", alsoCoversAreaIds: [] },
      { level: "location", primaryAreaId: "loc-999", alsoCoversAreaIds: [] },
    ]) {
      await expect(createAccountWithoutEmail({ ...input, scope }, actor)).rejects.toBeDefined();
    }
    expect(state.createUser).not.toHaveBeenCalled();
  });
  it("deletes the credential if the profile insert fails", async () => {
    state.insert.mockResolvedValue({ error: { message: "x" } });
    await expect(createAccountWithoutEmail(input, actor)).rejects.toMatchObject({ code: "provider_failed" });
    expect(state.deleteUser).toHaveBeenCalledWith("u1");
  });
});
