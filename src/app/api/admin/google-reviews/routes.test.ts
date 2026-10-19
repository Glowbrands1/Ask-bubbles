import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE GOOGLE REVIEWS ROUTES — who may call them, what they refuse, and what they
 * never return. Auth, the store and the sync are mocked; the real route code,
 * OAuth state handling, sealing and query parsing run.
 */

const KEY = randomBytes(32).toString("base64");
const ENV = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_TOKEN_ENCRYPTION_KEY", "GOOGLE_OAUTH_REDIRECT_URI", "NEXT_PUBLIC_SITE_URL", "GOOGLE_REVIEWS_SYNC_ENABLED", "GOOGLE_REVIEWS_SCHEDULE_ENABLED", "GOOGLE_REVIEWS_WRITES_ENABLED", "CRON_SECRET", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

beforeEach(() => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "CLIENT-SECRET-VALUE";
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = KEY;
  process.env.NEXT_PUBLIC_SITE_URL = "https://askbubbles.example";
});
afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
  for (const mod of ["@/lib/api/respond", "@/lib/auth/server", "@/lib/google-reviews/store", "@/lib/google-reviews/sync", "@/lib/google-reviews/views", "@/lib/google-reviews/status"]) vi.doUnmock(mod);
});

interface FakeStore {
  saved: { sealed: string; scopes: readonly string[]; actor: string }[];
  ended: { status: string; code: string | null; actor: string }[];
  links: unknown[][];
  cleared: string[];
  connection: { refreshTokenSealed: string } | null;
  evidence: Record<string, { matchStatus: string; evidence: Record<string, unknown> }>;
}

async function load(options: { permitted?: boolean; subject?: string; store?: Partial<FakeStore> } = {}) {
  vi.resetModules();
  const seen = { permissions: [] as string[], syncs: [] as Record<string, unknown>[], rateLimited: 0 };
  const store: FakeStore = { saved: [], ended: [], links: [], cleared: [], connection: null, evidence: {}, ...options.store };

  vi.doMock("@/lib/api/respond", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api/respond")>()),
    assertLiveMode: () => {},
    assertNoConfigurationProblems: () => {},
    assertWithinRateLimit: () => { seen.rateLimited += 1; },
  }));
  vi.doMock("@/lib/auth/server", () => ({
    authorizeRequest: async (_request: Request, permission: string) => {
      seen.permissions.push(permission);
      if (options.permitted === false) {
        const { AuthError } = await import("@/lib/auth/types");
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return { identity: { subject: options.subject ?? "admin-1", email: "admin@example.test", role: "admin" } };
    },
  }));
  vi.doMock("@/lib/google-reviews/store", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/google-reviews/store")>()),
    createSupabaseGoogleStore: () => ({
      getActiveConnection: async () => store.connection,
      saveConnection: async (sealed: string, scopes: readonly string[], actor: string) => { store.saved.push({ sealed, scopes, actor }); return "conn-1"; },
      endConnection: async (status: string, code: string | null, actor: string) => { store.ended.push({ status, code, actor }); },
      getLocationEvidence: async (code: string) => store.evidence[code] ?? null,
      recordLink: async (...args: unknown[]) => { store.links.push(args); return "confirmed"; },
      clearLink: async (code: string) => { store.cleared.push(code); return true; },
    }),
  }));
  vi.doMock("@/lib/google-reviews/sync", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/google-reviews/sync")>()),
    runGoogleReviewsSync: async (opts: Record<string, unknown>) => {
      seen.syncs.push(opts);
      return { status: "succeeded", mode: opts.dryRun ? "dry_run" : "save", code: null, reason: null, runId: "run-1", missing: [], stores: [], totals: {} };
    },
  }));
  vi.doMock("@/lib/google-reviews/views", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/google-reviews/views")>()),
    readStoreSummaries: async () => [{ storeCode: "219" }],
    readReviewPage: async (query: unknown) => ({ rows: [], total: 0, page: 1, pageSize: 20, echoed: query }),
  }));
  vi.doMock("@/lib/google-reviews/status", () => ({ readGoogleReviewsStatus: async () => ({ enabled: true, connection: { state: "none" }, runs: [], blocker: { code: "not_connected" } }) }));

  return {
    seen, store,
    connect: (await import("./connect/route")).GET,
    callback: (await import("./callback/route")).GET,
    disconnect: (await import("./disconnect/route")).POST,
    sync: await import("./sync/route"),
    locations: await import("./locations/route"),
    reviews: (await import("./reviews/route")).GET,
  };
}

const get = (path: string, headers: Record<string, string> = {}) => new Request(`https://askbubbles.example${path}`, { headers });
const post = (path: string, body: unknown) => new Request(`https://askbubbles.example${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("every admin route requires manage_integrations", () => {
  it("answers 403 and does nothing else when the role lacks it", async () => {
    const r = await load({ permitted: false });
    const responses = [
      await r.connect(get("/api/admin/google-reviews/connect")),
      await r.callback(get("/api/admin/google-reviews/callback?code=x&state=y")),
      await r.disconnect(post("/api/admin/google-reviews/disconnect", {})),
      await r.sync.POST(post("/api/admin/google-reviews/sync", {})),
      await r.sync.GET(get("/api/admin/google-reviews/sync")),
      await r.locations.POST(post("/api/admin/google-reviews/locations", { action: "clear", storeCode: "219" })),
      await r.locations.GET(get("/api/admin/google-reviews/locations")),
      await r.reviews(get("/api/admin/google-reviews/reviews")),
    ];
    expect(responses.map((x) => x.status)).toEqual(Array(8).fill(403));
    expect(new Set(r.seen.permissions)).toEqual(new Set(["manage_integrations"]));
    expect(r.seen.syncs).toHaveLength(0);
    expect(r.store.saved).toHaveLength(0);
    expect(r.store.ended).toHaveLength(0);
    expect(r.store.cleared).toHaveLength(0);
  });
});

describe("connect", () => {
  it("redirects to Google's consent screen with PKCE and one scope, and sets a SEALED HttpOnly cookie scoped to the callback", async () => {
    const r = await load();
    const res = await r.connect(get("/api/admin/google-reviews/connect"));
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("redirect_uri")).toBe("https://askbubbles.example/api/admin/google-reviews/callback");
    expect(location.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/business.manage");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.toString()).not.toContain("CLIENT-SECRET-VALUE");
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^gbp_oauth=v1\./);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\/api\/admin\/google-reviews\/callback/);
    expect(cookie).not.toContain(location.searchParams.get("state")!);
  });

  it("answers 503 naming the missing VARIABLES (never values) when Google OAuth is not configured", async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    const r = await load();
    const res = await r.connect(get("/api/admin/google-reviews/connect"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.missing).toEqual(["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_TOKEN_ENCRYPTION_KEY"]);
    expect(JSON.stringify(body)).not.toMatch(/CLIENT-SECRET-VALUE/);
  });
});

describe("callback", () => {
  async function startAttempt(r: Awaited<ReturnType<typeof load>>) {
    const start = await r.connect(get("/api/admin/google-reviews/connect"));
    const cookie = start.headers.get("set-cookie")!.split(";")[0]!;
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    return { cookie, state };
  }
  const grant = (over: object = {}) => vi.fn(async () => new Response(JSON.stringify({ access_token: "ACCESS-DISCARDED", refresh_token: "REFRESH-SECRET-1", scope: "https://www.googleapis.com/auth/business.manage", ...over }), { status: 200 }));

  it("verifies state, exchanges the code with the PKCE verifier, SEALS the refresh token, saves it, and clears the attempt cookie", async () => {
    const r = await load();
    const { cookie, state } = await startAttempt(r);
    const fetchMock = grant();
    vi.stubGlobal("fetch", fetchMock);
    const res = await r.callback(get(`/api/admin/google-reviews/callback?code=THE-CODE&state=${state}`, { cookie }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://askbubbles.example/admin/integrations/google-reviews?connected=1");
    expect(res.headers.get("set-cookie")).toMatch(/gbp_oauth=;/);
    const body = new URLSearchParams(String((fetchMock.mock.calls[0] as unknown[])[1] && ((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body));
    expect(body.get("code")).toBe("THE-CODE");
    expect(body.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r.store.saved).toHaveLength(1);
    expect(r.store.saved[0]!.sealed).toMatch(/^v1\./);
    expect(JSON.stringify(r.store.saved)).not.toMatch(/REFRESH-SECRET|ACCESS-DISCARDED/);
    expect(r.store.saved[0]!.actor).toBe("admin:admin@example.test");
  });

  it("refuses a forged or missing state, an expired attempt, a denial, and a grant without the business scope — saving nothing and reflecting nothing", async () => {
    const r = await load();
    const { cookie, state } = await startAttempt(r);
    vi.stubGlobal("fetch", grant());
    const cases: [string, Record<string, string>, string][] = [
      [`code=c&state=${state}x`, { cookie }, "state_mismatch"],
      [`code=c&state=${state}`, {}, "attempt_invalid"],
      ["code=c", { cookie }, "attempt_invalid"],
      ["error=access_denied&error_description=bob%40example.invalid", { cookie }, "denied"],
      [`state=${state}`, { cookie }, "attempt_invalid"],
    ];
    for (const [query, headers, expected] of cases) {
      const res = await r.callback(get(`/api/admin/google-reviews/callback?${query}`, headers));
      expect(res.headers.get("location"), query).toBe(`https://askbubbles.example/admin/integrations/google-reviews?error=${expected}`);
      expect(res.headers.get("location")).not.toMatch(/bob|example\.invalid/);
    }
    vi.stubGlobal("fetch", grant({ scope: "openid email" }));
    const noScope = await r.callback(get(`/api/admin/google-reviews/callback?code=c&state=${state}`, { cookie }));
    expect(noScope.headers.get("location")).toContain("error=missing_scope");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ access_token: "a", scope: "https://www.googleapis.com/auth/business.manage" }), { status: 200 }));
    const noRefresh = await r.callback(get(`/api/admin/google-reviews/callback?code=c&state=${state}`, { cookie }));
    expect(noRefresh.headers.get("location")).toContain("error=no_refresh_token");
    expect(r.store.saved).toHaveLength(0);
  });
});

describe("disconnect", () => {
  it("revokes at Google (best effort), ends the local connection, and never returns a token", async () => {
    const { seal, REFRESH_TOKEN_LABEL } = await import("@/lib/google-reviews/crypto");
    const sealed = seal("REFRESH-SECRET-2", REFRESH_TOKEN_LABEL, Buffer.from(KEY, "base64"));
    const r = await load({ store: { connection: { refreshTokenSealed: sealed } } });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await r.disconnect(post("/api/admin/google-reviews/disconnect", {}));
    expect(await res.json()).toEqual({ status: "ok", disconnected: true, revokedAtGoogle: true });
    expect(new URLSearchParams(String(((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body)).get("token")).toBe("REFRESH-SECRET-2");
    expect(r.store.ended).toEqual([{ status: "revoked", code: null, actor: "admin:admin@example.test" }]);
  });

  it("still ends the local connection when Google cannot be reached, and is a no-op when nothing is connected", async () => {
    const { seal, REFRESH_TOKEN_LABEL } = await import("@/lib/google-reviews/crypto");
    const r = await load({ store: { connection: { refreshTokenSealed: seal("T", REFRESH_TOKEN_LABEL, Buffer.from(KEY, "base64")) } } });
    vi.stubGlobal("fetch", async () => { throw new Error("down"); });
    expect(await (await r.disconnect(post("/api/admin/google-reviews/disconnect", {}))).json()).toMatchObject({ disconnected: true, revokedAtGoogle: false });
    expect(r.store.ended).toHaveLength(1);
    const none = await load();
    expect(await (await none.disconnect(post("/api/admin/google-reviews/disconnect", {}))).json()).toMatchObject({ disconnected: false });
    expect(none.store.ended).toHaveLength(0);
  });
});

describe("sync", () => {
  it("is a DRY RUN unless the body says dryRun:false AND confirmSave:true; a half-written save is a 400 before anything runs", async () => {
    const r = await load();
    for (const body of [{}, { dryRun: true }, { confirmSave: true }, { dryRun: "false", confirmSave: true }, { dryRun: 0 }]) await r.sync.POST(post("/api/admin/google-reviews/sync", body));
    expect(r.seen.syncs.map((s) => s.dryRun)).toEqual([true, true, true, true, true]);
    for (const body of [{ dryRun: false }, { dryRun: false, confirmSave: "true" }, { dryRun: false, confirmSave: 1 }, { dryRun: false, confirmSave: false }]) {
      const res = await r.sync.POST(post("/api/admin/google-reviews/sync", body));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ status: "confirmation_required", field: "confirmSave" });
    }
    expect(r.seen.syncs).toHaveLength(5);
    await r.sync.POST(post("/api/admin/google-reviews/sync", { dryRun: false, confirmSave: true }));
    expect(r.seen.syncs.at(-1)).toMatchObject({ dryRun: false, requestedBy: "admin:admin@example.test" });
  });

  it("takes the audit label from the session, never from the body, and GET reports status without secrets", async () => {
    const r = await load();
    await r.sync.POST(post("/api/admin/google-reviews/sync", { requestedBy: "attacker", dryRun: true }));
    expect(r.seen.syncs[0]!.requestedBy).toBe("admin:admin@example.test");
    const status = await (await r.sync.GET(get("/api/admin/google-reviews/sync"))).json();
    expect(status).toMatchObject({ status: "ok", blocker: { code: "not_connected" } });
    expect(JSON.stringify(status)).not.toMatch(/SECRET|REFRESH|ACCESS/);
  });
});

describe("locations", () => {
  const candidate = (account = "accounts/10", location = "locations/20") => ({ matchStatus: "candidate", evidence: { candidate: { account, location, title: "Buff City Soap" } } });

  it("accepts only the seven approved store codes", async () => {
    const r = await load();
    for (const storeCode of ["140", "0219", "", "219 ", "219; drop table x", 219, null, undefined]) {
      const res = await r.locations.POST(post("/api/admin/google-reviews/locations", { action: "clear", storeCode }));
      expect(res.status, String(storeCode)).toBe(400);
    }
    expect(r.store.cleared).toHaveLength(0);
  });

  it("confirms ONLY the exact candidate the sync recorded for that store — never an arbitrary Google location", async () => {
    const r = await load({ store: { evidence: { "219": candidate(), "225": { matchStatus: "unmatched", evidence: {} }, "236": { matchStatus: "matched", evidence: {} } } } });
    const ok = await r.locations.POST(post("/api/admin/google-reviews/locations", { action: "confirm", storeCode: "219", account: "accounts/10", location: "locations/20" }));
    expect(ok.status).toBe(200);
    expect(r.store.links).toHaveLength(1);
    expect(r.store.links[0]!.slice(0, 5)).toEqual(["219", "accounts/10", "locations/20", "confirmed", "high"]);
    expect(r.store.links[0]![6]).toBe("admin:admin@example.test");

    for (const body of [
      { storeCode: "219", account: "accounts/10", location: "locations/999" }, // a different location than the candidate
      { storeCode: "219", account: "accounts/99", location: "locations/20" },
      { storeCode: "225", account: "accounts/10", location: "locations/20" }, // no candidate for this store
      { storeCode: "236", account: "accounts/10", location: "locations/20" }, // already matched
      { storeCode: "264", account: "accounts/10", location: "locations/20" }, // unknown evidence
    ]) {
      const res = await r.locations.POST(post("/api/admin/google-reviews/locations", { action: "confirm", ...body }));
      expect(res.status, JSON.stringify(body)).toBe(409);
    }
    for (const body of [{ storeCode: "219", account: "accounts/x", location: "locations/20" }, { storeCode: "219", account: "accounts/10", location: "../x" }, { storeCode: "219" }]) {
      expect((await r.locations.POST(post("/api/admin/google-reviews/locations", { action: "confirm", ...body }))).status).toBe(400);
    }
    expect(r.store.links).toHaveLength(1);
  });

  it("clears a link, and rejects an unknown action", async () => {
    const r = await load();
    expect(await (await r.locations.POST(post("/api/admin/google-reviews/locations", { action: "clear", storeCode: "66" }))).json()).toEqual({ status: "ok", cleared: true });
    expect(r.store.cleared).toEqual(["66"]);
    expect((await r.locations.POST(post("/api/admin/google-reviews/locations", { action: "delete", storeCode: "66" }))).status).toBe(400);
  });
});

describe("reviews", () => {
  it("parses the query strictly: a Sun Tan City store code, a bad rating or a malformed date are dropped before the database", async () => {
    const r = await load();
    const body = await (await r.reviews(get("/api/admin/google-reviews/reviews?store=140&rating=9&reply=x&from=2026-02-30&page=-1"))).json();
    expect(body.query).toEqual({ store: null, rating: null, reply: null, from: null, to: null, removed: false, page: 1 });
    const ok = await (await r.reviews(get("/api/admin/google-reviews/reviews?store=219&rating=4&reply=unanswered&from=2026-09-01&to=2026-09-30&page=2"))).json();
    expect(ok.query).toEqual({ store: "219", rating: 4, reply: "unanswered", from: "2026-09-01", to: "2026-09-30", removed: false, page: 2 });
  });
});

describe("the scheduled refresh", () => {
  const SECRET = "cron-secret-value-0123456789abcdef0123456789";
  async function loadCron(env: Record<string, string | undefined> = {}) {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_cron_test_0000000000";
    process.env.CRON_SECRET = SECRET;
    process.env.GOOGLE_REVIEWS_SYNC_ENABLED = "true";
    process.env.GOOGLE_REVIEWS_SCHEDULE_ENABLED = "true";
    for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    const runs: Record<string, unknown>[] = [];
    vi.doMock("@/lib/google-reviews/sync", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/google-reviews/sync")>()),
      runGoogleReviewsSync: async (opts: Record<string, unknown>) => { runs.push(opts); return { status: "succeeded", mode: "save", code: null, reason: null, runId: "r", missing: [], stores: [], totals: {} }; },
    }));
    return { GET: (await import("../../google-reviews/cron/route")).GET, runs };
  }
  const call = (GET: (r: Request) => Promise<Response>, auth?: string) => GET(new Request("https://askbubbles.example/api/google-reviews/cron", { headers: auth ? { authorization: auth } : {} }));

  it("refuses without CRON_SECRET (503) and with a wrong or missing bearer (401) — and starts nothing", async () => {
    const closed = await loadCron({ CRON_SECRET: undefined });
    expect((await call(closed.GET, `Bearer ${SECRET}`)).status).toBe(503);
    const open = await loadCron();
    expect((await call(open.GET)).status).toBe(401);
    expect((await call(open.GET, "Bearer wrong-secret-value-000000000000000000")).status).toBe(401);
    expect((await call(open.GET, SECRET)).status).toBe(401); // not a Bearer header
    expect(open.runs).toHaveLength(0);
  });

  it("starts nothing while the master switch or the schedule switch is off", async () => {
    const off = await loadCron({ GOOGLE_REVIEWS_SYNC_ENABLED: undefined });
    expect(await (await call(off.GET, `Bearer ${SECRET}`)).json()).toMatchObject({ status: "disabled" });
    const noSchedule = await loadCron({ GOOGLE_REVIEWS_SCHEDULE_ENABLED: "false" });
    expect(await (await call(noSchedule.GET, `Bearer ${SECRET}`)).json()).toMatchObject({ status: "schedule_disabled" });
    expect(off.runs).toHaveLength(0);
    expect(noSchedule.runs).toHaveLength(0);
  });

  it("with every lock open, runs the SAME sync as a save, attributed to the cron, and answers with codes only", async () => {
    const live = await loadCron();
    const res = await call(live.GET, `Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(live.runs).toHaveLength(1);
    expect(live.runs[0]).toMatchObject({ requestedBy: "cron:google-reviews" });
    expect(live.runs[0]!.dryRun).toBeUndefined();
    expect(JSON.stringify(await res.json())).not.toMatch(/SECRET|REFRESH|ACCESS/);
  });

  it("is registered in vercel.json on a six-hour schedule, off the hour", async () => {
    const vercel = (await import("../../../../../vercel.json")).default as { crons: { path: string; schedule: string }[] };
    expect(vercel.crons.find((c) => c.path === "/api/google-reviews/cron")).toEqual({ path: "/api/google-reviews/cron", schedule: "23 */6 * * *" });
  });
});

describe("the administrator who starts a connection is the one who completes it", () => {
  const grantOk = () => vi.fn(async () => new Response(JSON.stringify({ access_token: "A", refresh_token: "R", scope: "https://www.googleapis.com/auth/business.manage" }), { status: 200 }));

  it("refuses a callback from a different administrator, saving nothing and never calling Google", async () => {
    const starter = await load({ subject: "admin-1" });
    const start = await starter.connect(get("/api/admin/google-reviews/connect"));
    const cookie = start.headers.get("set-cookie")!.split(";")[0]!;
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;

    const other = await load({ subject: "admin-2" });
    const fetchMock = grantOk();
    vi.stubGlobal("fetch", fetchMock);
    const res = await other.callback(get(`/api/admin/google-reviews/callback?code=THE-CODE&state=${state}`, { cookie }));
    expect(res.headers.get("location")).toBe("https://askbubbles.example/admin/integrations/google-reviews?error=attempt_invalid");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(other.store.saved).toHaveLength(0);
  });
});

describe("state-changing admin routes refuse cross-site requests", () => {
  const withHeaders = (path: string, body: unknown, headers: Record<string, string>) =>
    new Request(`https://askbubbles.example${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const CROSS: Record<string, string>[] = [{ origin: "https://evil.example" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { origin: "not a url" }];

  it.each(CROSS)("answers 403 before authorizing or touching anything: %j", async (headers) => {
    const r = await load({ store: { connection: { refreshTokenSealed: "v1.x.y.z" } } });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    for (const [route, path, body] of [
      [r.disconnect, "/api/admin/google-reviews/disconnect", {}],
      [r.sync.POST, "/api/admin/google-reviews/sync", { dryRun: false, confirmSave: true }],
      [r.locations.POST, "/api/admin/google-reviews/locations", { action: "clear", storeCode: "219" }],
    ] as const) {
      const res = await route(withHeaders(path, body, headers));
      expect(res.status, path).toBe(403);
      expect(await res.json()).toMatchObject({ status: "refused" });
    }
    expect(r.seen.permissions).toEqual([]);
    expect(r.seen.syncs).toEqual([]);
    expect(r.store.ended).toEqual([]);
    expect(r.store.cleared).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a same-origin browser request, and a header-less non-browser request, through to the normal checks", async () => {
    const r = await load();
    const same = await r.sync.POST(withHeaders("/api/admin/google-reviews/sync", {}, { origin: "https://askbubbles.example", "sec-fetch-site": "same-origin" }));
    expect(same.status).toBe(200);
    const bare = await r.sync.POST(withHeaders("/api/admin/google-reviews/sync", {}, {}));
    expect(bare.status).toBe(200);
    expect(r.seen.permissions).toEqual(["manage_integrations", "manage_integrations"]);
  });
});
