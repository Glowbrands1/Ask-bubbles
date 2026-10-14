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

const actor = { id: "a", email: "admin@x.com", role: "admin" as const };
const input = { email: "Jo@Example.com", displayName: "Jo", role: "employee", scope: { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] } };

beforeEach(() => {
  state.existing = null;
  state.createUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  state.insert.mockReset().mockResolvedValue({ error: null });
  state.deleteUser.mockReset().mockResolvedValue({});
});

describe("createAccountWithoutEmail", () => {
  it("creates a password-less, confirmed credential and an active location-scoped profile; sends nothing", async () => {
    await createAccountWithoutEmail(input, actor);
    expect(state.createUser).toHaveBeenCalledWith({ email: "jo@example.com", email_confirm: true });
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ role: "employee", status: "active", scope_level: "location", scope_primary_area_id: "loc-66" }));
    const code = readFileSync("src/lib/admin/create-account.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/inviteUserByEmail|resetPasswordForEmail|generateLink|password\s*[:=]/);
  });
  it("refuses a duplicate email without touching Auth", async () => {
    state.existing = { id: "x" };
    await expect(createAccountWithoutEmail(input, actor)).rejects.toMatchObject({ code: "duplicate_email" });
    expect(state.createUser).not.toHaveBeenCalled();
  });
  it.each(["admin", "owner", "developer"])("never creates a %s", async (role) => {
    await expect(createAccountWithoutEmail({ ...input, role }, actor)).rejects.toMatchObject({ code: "protected_account" });
    expect(state.createUser).not.toHaveBeenCalled();
  });
  it("never creates a global or district scope", async () => {
    await expect(createAccountWithoutEmail({ ...input, scope: { level: "global", primaryAreaId: null } }, actor)).rejects.toMatchObject({ code: "invalid_input" });
    expect(state.createUser).not.toHaveBeenCalled();
  });
  it("deletes the credential if the profile insert fails", async () => {
    state.insert.mockResolvedValue({ error: { message: "x" } });
    await expect(createAccountWithoutEmail(input, actor)).rejects.toMatchObject({ code: "provider_failed" });
    expect(state.deleteUser).toHaveBeenCalledWith("u1");
  });
});
