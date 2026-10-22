import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The exception end to end through the REAL provider and profile reader: only
 * an `active` profile reaches the switcher check. Only the Supabase client is
 * faked (no network); the row shape is the production `app_users` shape.
 */

const db = vi.hoisted(() => ({
  authUserId: null as string | null,
  row: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase/auth-clients", () => ({
  cookieJarFromHeaders: () => ({}),
  getSupabaseSessionClientFor: () => ({
    auth: {
      getUser: async () =>
        db.authUserId
          ? { data: { user: { id: db.authUserId } }, error: null }
          : { data: { user: null }, error: new Error("no session") },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: db.row, error: null }) }),
      }),
    }),
  }),
}));

import { SupabaseAuthProvider } from "./supabase-provider";

const page = vi.hoisted(() => ({ provider: null as unknown }));
vi.mock("./page", () => ({
  pageAuthorizationEnforced: () => true,
  pageIdentity: async () =>
    (page.provider as { identify(c: { headers: Headers }): Promise<unknown> }).identify({
      headers: new Headers(),
    }),
}));

import { APP_SWITCHER_USER_IDS, pageShowsAppSwitcher } from "./app-switcher";

const [DELPHINE, RM] = APP_SWITCHER_USER_IDS;

function profile(id: string, role: string, status: string, email = "x@glowbrands.com") {
  return {
    id,
    email,
    display_name: "Test",
    role,
    status,
    scope_level: "global",
    scope_primary_area_id: null,
    scope_also_covers_area_ids: [],
    created_at: "2026-10-14T00:00:00Z",
    updated_at: "2026-10-14T00:00:00Z",
  };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.invalid");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
  page.provider = new SupabaseAuthProvider();
  db.authUserId = null;
  db.row = null;
});

function signIn(id: string, role: string, status: string) {
  db.authUserId = id;
  db.row = profile(id, role, status);
}

describe("the named exception needs an ACTIVE profile", () => {
  it.each([
    ["Delphine", DELPHINE, "district_manager"],
    ["RM", RM, "regional_manager"],
  ])("%s: active is offered the switcher", async (_n, id, role) => {
    signIn(id, role, "active");
    expect(await pageShowsAppSwitcher()).toBe(true);
  });

  it.each([
    ["Delphine", DELPHINE, "district_manager"],
    ["RM", RM, "regional_manager"],
  ])("%s: disabled, invited and unknown statuses are not", async (_n, id, role) => {
    for (const status of ["disabled", "invited", "suspended", ""]) {
      signIn(id, role, status);
      expect(await pageShowsAppSwitcher(), status).toBe(false);
    }
  });

  it("a valid session with no profile row is not", async () => {
    db.authUserId = DELPHINE;
    db.row = null;
    expect(await pageShowsAppSwitcher()).toBe(false);
  });

  it("no session is not", async () => {
    expect(await pageShowsAppSwitcher()).toBe(false);
  });

  it("an active unrelated district or regional manager is not", async () => {
    signIn("00000000-0000-4000-8000-000000000001", "district_manager", "active");
    expect(await pageShowsAppSwitcher()).toBe(false);
    signIn("00000000-0000-4000-8000-000000000002", "regional_manager", "active");
    expect(await pageShowsAppSwitcher()).toBe(false);
  });

  it("a named id's role is read from the profile and stays non-admin", async () => {
    signIn(DELPHINE, "district_manager", "active");
    const identity = (await (page.provider as SupabaseAuthProvider).identify({
      headers: new Headers(),
    }))!;
    const { canAccessAdminConsole } = await import("@/lib/permissions");
    expect(canAccessAdminConsole(identity.role)).toBe(false);
    expect(identity.scope.level).toBe("global"); // unchanged by the exception
  });

  it("an active admin still is", async () => {
    signIn("00000000-0000-4000-8000-000000000003", "admin", "active");
    expect(await pageShowsAppSwitcher()).toBe(true);
  });

  it("a disabled admin is not", async () => {
    signIn("00000000-0000-4000-8000-000000000003", "admin", "disabled");
    expect(await pageShowsAppSwitcher()).toBe(false);
  });
});
