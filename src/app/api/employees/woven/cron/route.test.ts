import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/employees/woven/cron — every lock is checked before a sync can start.
 */

const SECRET = "cron-secret-for-tests-0123456789abcdef";

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "CRON_SECRET",
  "WOVEN_SYNC_ENABLED",
  "WOVEN_COMPANY_ID",
  "WOVEN_VALIDATION_ENABLED",
  "WOVEN_VALIDATION_ACCESS_CODE",
  "WOVEN_SYNC_WRITES_ENABLED",
  "WOVEN_SYNC_SCHEDULE_ENABLED",
  "WOVEN_SUBSCRIPTION_KEY",
  "WOVEN_USERNAME",
  "WOVEN_PASSWORD",
] as const;

const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.doUnmock("@/lib/employees/woven/sync");
  vi.doUnmock("@/lib/employees/woven/store");
  vi.unstubAllGlobals();
});

async function loadRoute(env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  vi.resetModules();
  for (const key of ENV_KEYS) delete process.env[key];
  const next: Record<string, string | undefined> = {
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test",
    ...env,
  };
  for (const [key, value] of Object.entries(next)) if (value !== undefined) process.env[key] = value;

  const runs: unknown[] = [];
  vi.doMock("@/lib/employees/woven/sync", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/employees/woven/sync")>()),
    runWovenEmployeeSync: async (options: unknown) => {
      runs.push(options);
      return { status: "succeeded", runId: "run-1", summary: { employeesReceived: 3 } };
    },
  }));

  const route = await import("./route");
  return { GET: route.GET, runs };
}

const request = (token?: string) =>
  new Request("https://ask-bubbles.test/api/employees/woven/cron", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

const ALL_ON = {
  CRON_SECRET: SECRET,
  WOVEN_SYNC_ENABLED: "true",
  WOVEN_COMPANY_ID: "55839F24-9241-418C-8405-37BAF9A42A87",
  WOVEN_SYNC_SCHEDULE_ENABLED: "true",
  WOVEN_SUBSCRIPTION_KEY: "k",
  WOVEN_USERNAME: "u",
  WOVEN_PASSWORD: "p",
};

describe("GET /api/employees/woven/cron", () => {
  it("is closed when CRON_SECRET is not set", async () => {
    const { GET, runs } = await loadRoute({ ...ALL_ON, CRON_SECRET: undefined });
    const response = await GET(request(SECRET));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("cron_secret_missing");
    expect(runs).toHaveLength(0);
  });

  it("refuses a missing or wrong bearer token", async () => {
    const { GET, runs } = await loadRoute(ALL_ON);
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("wrong-secret-wrong-secret-wrong"))).status).toBe(401);
    expect(runs).toHaveLength(0);
  });

  it("starts nothing with only the validation switch on, even with the schedule switch on", async () => {
    const { GET, runs } = await loadRoute({ ...ALL_ON, WOVEN_SYNC_ENABLED: "false", WOVEN_VALIDATION_ENABLED: "true" });
    const response = await GET(request(SECRET));
    expect((await response.json()).status).toBe("disabled");
    expect(runs).toHaveLength(0);
  });

  it("starts nothing with the validation switch and access code set, even with the schedule switch on", async () => {
    const { GET, runs } = await loadRoute({
      ...ALL_ON,
      WOVEN_SYNC_ENABLED: "false",
      WOVEN_VALIDATION_ENABLED: "true",
      WOVEN_VALIDATION_ACCESS_CODE: "test-access-code-7f3a9c2e41b8",
    });
    const response = await GET(request(SECRET));
    const text = await response.text();
    expect(JSON.parse(text).status).toBe("disabled");
    expect(text).not.toContain("test-access-code-7f3a9c2e41b8");
    expect(runs).toHaveLength(0);
  });

  it("starts nothing while the master switch is off", async () => {
    const { GET, runs } = await loadRoute({ ...ALL_ON, WOVEN_SYNC_ENABLED: "false" });
    const response = await GET(request(SECRET));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("disabled");
    expect(runs).toHaveLength(0);
  });

  it("starts nothing without WOVEN_COMPANY_ID, even with every other switch on", async () => {
    for (const companyId of [undefined, "not-a-guid"]) {
      const { GET, runs } = await loadRoute({ ...ALL_ON, WOVEN_SYNC_WRITES_ENABLED: "true", WOVEN_COMPANY_ID: companyId });
      const response = await GET(request(SECRET));
      expect(response.status).toBe(200);
      expect((await response.json()).status).toBe("disabled");
      expect(runs).toHaveLength(0);
    }
  });

  it("starts nothing while the schedule switch is off", async () => {
    const { GET, runs } = await loadRoute({ ...ALL_ON, WOVEN_SYNC_SCHEDULE_ENABLED: undefined });
    const response = await GET(request(SECRET));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("schedule_disabled");
    expect(runs).toHaveLength(0);
  });

  it("runs the sync as `cron` when every lock is open", async () => {
    const { GET, runs } = await loadRoute(ALL_ON);
    const response = await GET(request(SECRET));
    expect(response.status).toBe(200);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ requestedBy: "cron" });
  });

  it("refuses when Supabase is not configured", async () => {
    const { GET, runs } = await loadRoute(ALL_ON);
    delete process.env.SUPABASE_SECRET_KEY;
    expect((await GET(request(SECRET))).status).toBe(503);
    expect(runs).toHaveLength(0);
  });
});

describe("GET /api/employees/woven/cron cannot bypass the write switch", () => {
  it("5. every other lock open, writes off: the REAL sync refuses, with no store and no Woven call", async () => {
    vi.resetModules();
    for (const key of ENV_KEYS) delete process.env[key];
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_test",
      ...ALL_ON,
    });
    const seen = { fetches: 0, storesCreated: 0 };
    vi.stubGlobal("fetch", async () => {
      seen.fetches += 1;
      throw new Error("no network in this test");
    });
    vi.doMock("@/lib/employees/woven/store", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/employees/woven/store")>()),
      createSupabaseDirectoryStore: () => {
        seen.storesCreated += 1;
        throw new Error("the store must not be reached");
      },
    }));
    const { GET } = await import("./route");
    const response = await GET(request(SECRET));
    expect(response.status).toBe(409);
    expect((await response.json()).status).toBe("writes_disabled");
    expect(seen.fetches).toBe(0);
    expect(seen.storesCreated).toBe(0);
  });
});

/*
 * Owner, 28 Nov 2026: "make this automatic for both sunny and bubble". After a
 * SUCCESSFUL directory sync — and only then — WOVEN_ACCESS_MODE=apply runs the
 * apply step (DISABLE_TERMINATED); shadow records the plan; off does nothing.
 */
describe("GET /api/employees/woven/cron: the access step after the sync", () => {
  const ACCESS_KEYS = ["WOVEN_ACCESS_MODE", "WOVEN_ACCESS_APPLY_ACTIONS"] as const;
  const savedAccess = Object.fromEntries(ACCESS_KEYS.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const key of ACCESS_KEYS) {
      if (savedAccess[key] === undefined) delete process.env[key];
      else process.env[key] = savedAccess[key];
    }
    vi.doUnmock("@/lib/employees/woven/access/apply-run");
    vi.doUnmock("@/lib/employees/woven/access/shadow");
  });

  async function loadWith(syncStatus: string, access: Partial<Record<(typeof ACCESS_KEYS)[number], string>>) {
    vi.resetModules();
    for (const key of [...ENV_KEYS, ...ACCESS_KEYS]) delete process.env[key];
    Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_test", ...ALL_ON, ...access });
    const seen = { lifecycle: [] as unknown[][], shadow: [] as unknown[][] };
    vi.doMock("@/lib/employees/woven/sync", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/employees/woven/sync")>()),
      runWovenEmployeeSync: async () => ({ status: syncStatus, runId: "run-1", ...(syncStatus === "succeeded" ? { summary: {} } : { code: "woven_unavailable" }) }),
    }));
    vi.doMock("@/lib/employees/woven/access/apply-run", () => ({
      runAccessLifecycle: async (...args: unknown[]) => {
        seen.lifecycle.push(args);
        return { status: "completed", accessRunId: "access-1", tally: { applied: { DISABLE_TERMINATED: 1 }, failed: {}, skipped: 0 } };
      },
    }));
    vi.doMock("@/lib/employees/woven/access/shadow", () => ({
      recordAccessShadowRun: async (...args: unknown[]) => {
        seen.shadow.push(args);
        return { status: "recorded", accessRunId: "shadow-1", aborted: false, actions: 3 };
      },
    }));
    const { GET } = await import("./route");
    return { GET, seen };
  }

  const APPLY = { WOVEN_ACCESS_MODE: "apply", WOVEN_ACCESS_APPLY_ACTIONS: "DISABLE_TERMINATED" };

  it("apply: after a successful sync the apply step runs once, as cron, and its codes-only outcome is in the response", async () => {
    const { GET, seen } = await loadWith("succeeded", APPLY);
    const response = await GET(request(SECRET));
    const body = await response.json();
    expect(seen.lifecycle).toEqual([["cron"]]);
    expect(seen.shadow).toEqual([]);
    expect(body.accessLifecycle).toEqual({ status: "completed", accessRunId: "access-1", tally: { applied: { DISABLE_TERMINATED: 1 }, failed: {}, skipped: 0 } });
    expect(body.accessShadow).toBeUndefined();
  });

  it.each(["failed", "rejected", "busy", "writes_disabled"])("apply: a sync that ends %s runs no apply step at all", async (status) => {
    const { GET, seen } = await loadWith(status, APPLY);
    const body = await (await GET(request(SECRET))).json();
    expect(seen.lifecycle).toEqual([]);
    expect(seen.shadow).toEqual([]);
    expect(body.accessLifecycle).toBeUndefined();
  });

  it("shadow still only records; off (or a refused apply configuration) does neither", async () => {
    const shadow = await loadWith("succeeded", { WOVEN_ACCESS_MODE: "shadow" });
    expect((await (await shadow.GET(request(SECRET))).json()).accessShadow).toMatchObject({ status: "recorded" });
    expect(shadow.seen.lifecycle).toEqual([]);

    for (const access of [{}, { WOVEN_ACCESS_MODE: "apply", WOVEN_ACCESS_APPLY_ACTIONS: "DISABLE_TERMINATED,CREATE_USER" }]) {
      const { GET, seen } = await loadWith("succeeded", access);
      const body = await (await GET(request(SECRET))).json();
      expect(seen.lifecycle).toEqual([]);
      expect(seen.shadow).toEqual([]);
      expect(body.accessLifecycle).toBeUndefined();
      expect(body.accessShadow).toBeUndefined();
    }
  });
});
