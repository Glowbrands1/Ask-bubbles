import { afterEach, describe, expect, it, vi } from "vitest";

/* A fixture roster: the production roster is deliberately empty. */
vi.mock("@/config/company/locations", () => ({
  LOCATION_CODE_PATTERN: /^[A-Za-z0-9][A-Za-z0-9-]{0,15}$/,
  COMPANY_LOCATION_ENTRIES: [{ code: "0306", name: "Example Location 306", state: null, districtId: null }],
  COMPANY_DISTRICT_ENTRIES: [],
  COMPANY_REGION_ENTRIES: [],
  COMPANY_LOCATION_NICKNAMES: {},
  COMPANY_LOCATION_ABBREVIATIONS: {},
}));

import {
  createFakeWoven,
  FAKE_CREDENTIALS,
  wovenDetails,
  wovenEmployee,
  wovenLocation,
} from "@/lib/employees/woven/test-support";

/**
 * ============================================================================
 * THE DEMO-MODE CONNECTION TEST, END TO END
 * ============================================================================
 *
 * The real route, the real validation, the real Woven client — against the
 * fake Operations API on `fetch` and a Supabase client that records every
 * method called and throws on any write. Demo mode, the access code, the
 * validation switch on and the sync switch off: the only configuration the
 * Preview will have.
 *
 * Proves: the only Woven calls are the token POST and the four documented
 * reads; Supabase is never called (the location roster is configuration, and
 * the coverage counts compare against it); nothing is written anywhere; and
 * the code and credentials appear nowhere in the response.
 */

const ENV = [
  "WOVEN_VALIDATION_ACCESS_CODE",
  "WOVEN_VALIDATION_ENABLED",
  "WOVEN_SYNC_ENABLED",
  "WOVEN_SUBSCRIPTION_KEY",
  "WOVEN_USERNAME",
  "WOVEN_PASSWORD",
] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const key of ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
  for (const m of ["@/lib/config/runtime", "@/lib/api/respond", "@/lib/auth/server", "@/lib/supabase/server"]) vi.doUnmock(m);
});

const CODE = "test-access-code-7f3a9c2e41b8";
const WRITE_METHODS = ["insert", "update", "upsert", "delete", "rpc"];

async function run(body: unknown) {
  vi.resetModules();
  Object.assign(process.env, {
    WOVEN_VALIDATION_ACCESS_CODE: CODE,
    WOVEN_VALIDATION_ENABLED: "true",
    WOVEN_SYNC_ENABLED: "false",
    WOVEN_SUBSCRIPTION_KEY: FAKE_CREDENTIALS.subscriptionKey,
    WOVEN_USERNAME: FAKE_CREDENTIALS.username,
    WOVEN_PASSWORD: FAKE_CREDENTIALS.password,
  });

  const fake = createFakeWoven({
    employees: [
      wovenEmployee("A0", { firstName: "Genevieve", email: "genevieve@example.test", primaryLocationId: "WL-0", hasMultipleLocationAccess: true }),
      wovenEmployee("A1", { firstName: "Horatio", email: "horatio@example.test", primaryLocationId: "WL-0" }),
    ],
    details: { A0: wovenDetails("A0", [{ id: "WL-0" }, { id: "WL-1" }]), A1: wovenDetails("A1", [{ id: "WL-0" }]) },
    tokenLifetimeSeconds: 1800,
    locations: [wovenLocation("WL-0", { number: "0306" })],
  });
  vi.stubGlobal("fetch", fake.fetch);

  const supabase: { calls: string[] } = { calls: [] };
  const table = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (...args: unknown[]) => {
          supabase.calls.push(`${name}.${method}(${args.map(String).join(", ")})`);
          if (WRITE_METHODS.includes(method)) throw new Error(`Supabase write attempted: ${name}.${method}`);
          throw new Error(`unexpected Supabase method ${name}.${method}`);
        },
      },
    );
  vi.doMock("@/lib/supabase/server", () => ({
    getSupabaseAdmin: () =>
      new Proxy(
        {},
        {
          get: (_t, method: string) => {
            if (method === "from") return (name: string) => table(name);
            return (...args: unknown[]) => {
              supabase.calls.push(`${method}(${args.map(String).join(", ")})`);
              throw new Error(`Supabase ${method} attempted`);
            };
          },
        },
      ),
  }));
  vi.doMock("@/lib/config/runtime", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/config/runtime")>()),
    isDemoMode: () => true,
    isProductionDeployment: () => false,
  }));
  vi.doMock("@/lib/api/respond", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api/respond")>()),
    assertNoConfigurationProblems: () => {},
    assertWithinRateLimit: () => {},
  }));
  /* The demo role switcher's identity: unverified, as demo mode always is. */
  vi.doMock("@/lib/auth/server", () => ({
    authorizeRequest: async (_r: Request, permission: string) => ({
      identity: { subject: "demo:owner", email: "owner@demo.test", role: "owner", verified: false },
      permission,
      provider: "demo",
    }),
  }));

  const { POST } = await import("./route");
  const response = await POST(
    new Request("https://ask-bubbles.test/api/admin/employees/woven/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { response, text: await response.text(), fake, supabase };
}

/* The real client paces requests ~650ms apart (Woven's rate limit), so a full run takes several seconds. */
describe("demo mode + access code + validation on + sync off", { timeout: 60_000 }, () => {
  it("runs the real validation: Woven reads only, no Supabase call, no write anywhere", async () => {
    const { response, text, fake, supabase } = await run({ accessCode: CODE });
    expect(response.status).toBe(200);
    expect(JSON.parse(text).report.token.ok).toBe(true);
    expect(JSON.parse(text).report.locations.locationCoverage).toMatchObject({ outcome: "compared", exactMatches: 1 });

    /* 5. Woven: the token POST, then GETs to the four documented reads. Nothing else. */
    expect(fake.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`)).toEqual(["POST /tokens/v2"]);
    for (const call of fake.calls.filter((c) => c.method === "GET")) {
      expect(["/employees", "/lists/enums", "/locations"].includes(call.path) || /^\/employees\/[^/]+\/details$/.test(call.path), call.path).toBe(true);
    }

    /* 4. Supabase: not called at all — no read, and no insert, update, upsert, delete or rpc. */
    expect(supabase.calls).toEqual([]);

    /* Nothing sensitive in the response. */
    for (const forbidden of [CODE, FAKE_CREDENTIALS.password, FAKE_CREDENTIALS.subscriptionKey, "Genevieve", "genevieve@", "Horatio"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("with a wrong code, reaches neither Woven nor Supabase", async () => {
    const { response, fake, supabase } = await run({ accessCode: "wrong-guess-000000" });
    expect(response.status).toBe(403);
    expect(fake.calls).toHaveLength(0);
    expect(supabase.calls).toHaveLength(0);
  });
});
