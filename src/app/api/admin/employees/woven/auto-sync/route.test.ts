import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * /api/admin/employees/woven/auto-sync — administrators only; turning ON needs every
 * readiness check; turning OFF always works; the audit actor comes from the session.
 */

const ENV = ["WOVEN_SYNC_ENABLED", "WOVEN_SYNC_WRITES_ENABLED", "WOVEN_COMPANY_ID", "WOVEN_SUBSCRIPTION_KEY", "WOVEN_USERNAME", "WOVEN_PASSWORD", "WOVEN_BCS_USERNAME", "WOVEN_BCS_PASSWORD", "WOVEN_BCS_COMPANY_ID"] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const READY = {
  WOVEN_SYNC_ENABLED: "true",
  WOVEN_SYNC_WRITES_ENABLED: "true",
  WOVEN_COMPANY_ID: "55839F24-9241-418C-8405-37BAF9A42A87",
  WOVEN_SUBSCRIPTION_KEY: "k",
  WOVEN_USERNAME: "u",
  WOVEN_PASSWORD: "p",
};

afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.doUnmock("@/lib/api/respond");
  vi.doUnmock("@/lib/auth/server");
  vi.doUnmock("@/lib/employees/woven/auto-sync");
});

async function loadRoute(env: Partial<Record<(typeof ENV)[number], string>>, options: { permitted?: boolean; dbRefuses?: boolean } = {}) {
  vi.resetModules();
  for (const key of ENV) delete process.env[key];
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const seen = { permissions: [] as string[], sets: [] as { enabled: boolean; actor: string }[] };

  vi.doMock("@/lib/api/respond", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api/respond")>()),
    assertLiveMode: () => {},
    assertNoConfigurationProblems: () => {},
    assertWithinRateLimit: () => {},
  }));
  vi.doMock("@/lib/auth/server", () => ({
    authorizeRequest: async (_r: Request, permission: string) => {
      seen.permissions.push(permission);
      if (options.permitted === false) {
        const { AuthError } = await import("@/lib/auth/types");
        throw new AuthError("forbidden", "no");
      }
      return { identity: { subject: "admin-1", email: "admin@example.test", role: "admin" } };
    },
  }));
  vi.doMock("@/lib/employees/woven/auto-sync", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/lib/employees/woven/auto-sync")>();
    return {
      ...original,
      setAutoSync: async (enabled: boolean, actor: string) => {
        if (enabled && options.dbRefuses) throw new original.AutoSyncError("auto_sync_requires_saved_directory");
        seen.sets.push({ enabled, actor });
        return { enabled, changed: true };
      },
      readAutoSync: async () => ({ enabled: false, updatedAt: null, updatedBy: null }),
    };
  });
  const route = await import("./route");
  return { POST: route.POST, GET: route.GET, seen };
}

const post = (body: unknown) =>
  new Request("https://ask-bubbles.test/api/admin/employees/woven/auto-sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/admin/employees/woven/auto-sync", () => {
  it("requires manage_integrations and does nothing for anyone else", async () => {
    const { POST, seen } = await loadRoute(READY, { permitted: false });
    expect((await POST(post({ enabled: true }))).status).toBe(403);
    expect(seen.permissions).toEqual(["manage_integrations"]);
    expect(seen.sets).toHaveLength(0);
  });

  it("needs a real boolean", async () => {
    const { POST, seen } = await loadRoute(READY);
    for (const body of [{}, { enabled: "true" }, { enabled: 1 }, { enabled: null }]) {
      const response = await POST(post(body));
      expect(response.status).toBe(400);
    }
    expect(seen.sets).toHaveLength(0);
  });

  it("turns ON when every readiness check holds, recording the session's identity — never the body's", async () => {
    const { POST, seen } = await loadRoute(READY);
    const response = await POST(post({ enabled: true, actor: "someone-else" }));
    expect(response.status).toBe(200);
    expect(seen.sets).toEqual([{ enabled: true, actor: "admin:admin@example.test" }]);
  });

  it("refuses ON while the sync is off, unconfigured, or pinned to another company", async () => {
    for (const env of [{ ...READY, WOVEN_SYNC_ENABLED: "false" }, { ...READY, WOVEN_SUBSCRIPTION_KEY: undefined }, { ...READY, WOVEN_COMPANY_ID: "11111111-2222-4333-8444-555555555555" }] as Record<string, string | undefined>[]) {
      const clean = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)) as Record<string, string>;
      const { POST, seen } = await loadRoute(clean);
      const response = await POST(post({ enabled: true }));
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe("sync_not_ready");
      expect(seen.sets).toHaveLength(0);
    }
  });

  it("refuses ON while stored syncs are switched off", async () => {
    const { POST, seen } = await loadRoute({ ...READY, WOVEN_SYNC_WRITES_ENABLED: "false" });
    const response = await POST(post({ enabled: true }));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("writes_disabled");
    expect(seen.sets).toHaveLength(0);
  });

  it("passes the database's refusal through when no directory has been saved", async () => {
    const { POST } = await loadRoute(READY, { dbRefuses: true });
    const response = await POST(post({ enabled: true }));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("auto_sync_requires_saved_directory");
  });

  it("turning OFF always works — even with nothing configured", async () => {
    const { POST, seen } = await loadRoute({});
    const response = await POST(post({ enabled: false }));
    expect(response.status).toBe(200);
    expect(seen.sets).toEqual([{ enabled: false, actor: "admin:admin@example.test" }]);
  });
});

describe("GET /api/admin/employees/woven/auto-sync", () => {
  it("reports the setting and the schedule this build runs, to administrators only", async () => {
    const { GET, seen } = await loadRoute(READY);
    const response = await GET(new Request("https://ask-bubbles.test/api/admin/employees/woven/auto-sync"));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.setting.enabled).toBe(false);
    expect(json.schedule).toBe("17 11 * * *");
    expect(seen.permissions).toEqual(["manage_integrations"]);
  });
});
