import { afterEach, describe, expect, it, vi } from "vitest";

/** `GET /invite-suggestion`: who may ask, and that it changes nothing. */

const seenTenantFilters: string[] = [];

const MOCKED = [
  "@/lib/api/respond",
  "@/lib/auth/server",
  "@/lib/employees/woven/directory",
  "@/lib/employees/woven/locations",
  "@/lib/employees/woven/positions",
  "@/lib/supabase/server",
];

afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
});

async function load(options: { deny?: string[]; role?: string; rows?: unknown[]; tenant?: string[]; locations?: unknown[]; positions?: unknown[] } = {}) {
  vi.resetModules();
  const permissions: string[] = [];
  vi.doMock("@/lib/api/respond", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api/respond")>()),
    assertLiveMode: () => {},
  }));
  vi.doMock("@/lib/auth/server", () => ({
    authorizeRequest: async (_request: Request, permission: string) => {
      permissions.push(permission);
      if (options.deny?.includes(permission)) {
        const { AuthError } = await import("@/lib/auth/types");
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return { identity: { subject: "admin-1", email: "admin@example.test", role: options.role ?? "admin" }, permission };
    },
  }));
  const reads = { directory: 0 };
  vi.doMock("@/lib/employees/woven/directory", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/employees/woven/directory")>()),
    loadDirectoryRows: async () => {
      reads.directory += 1;
      return (options.rows ?? []) as never[];
    },
  }));
  vi.doMock("@/lib/employees/woven/locations", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/employees/woven/locations")>()),
    listWovenLocations: async () => (options.locations ?? []) as never[],
  }));
  vi.doMock("@/lib/employees/woven/positions", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/employees/woven/positions")>()),
    listWovenPositions: async () => (options.positions ?? []) as never[],
  }));
  vi.doMock("@/lib/supabase/server", () => ({
    getSupabaseAdmin: () => ({
      from: () => ({
        select: () => ({
          not: async () => ({ data: [], error: null }),
          eq: (column: string, value: string) => {
            seenTenantFilters.push(`${column}=${value}`);
            return { ilike: async () => ({ data: (options.tenant ?? []).map((id) => ({ external_employee_id: id })), error: null }) };
          },
        }),
      }),
    }),
  }));
  const { GET } = await import("./invite-suggestion/route");
  return { GET, permissions, reads };
}

const get = (query: string) =>
  new Request(`https://ask-sunny.test/api/admin/employees/woven/invite-suggestion${query}`);

describe("GET /invite-suggestion", () => {
  it("answers an administrator, with no-store, and an unknown email is not_found", async () => {
    const { GET, permissions } = await load();
    const response = await GET(get("?email=nobody%40example.com"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "not_found" });
    expect(permissions).toEqual(["manage_users"]);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("is refused without manage_users, and reads nothing", async () => {
    const { GET, reads } = await load({ deny: ["manage_users"] });
    expect((await GET(get("?email=a%40b.co"))).status).toBe(403);
    expect(reads.directory).toBe(0);
  });

  it("is refused for a role without manage_integrations, and reads nothing", async () => {
    const { GET, reads } = await load({ role: "location_manager" });
    expect((await GET(get("?email=a%40b.co"))).status).toBe(403);
    expect(reads.directory).toBe(0);
  });

  it("refuses a missing or oversized address", async () => {
    const { GET } = await load();
    expect((await GET(get(""))).status).toBe(400);
    expect((await GET(get(`?email=${"a".repeat(300)}`))).status).toBe(400);
  });
});

describe("tenant boundary and reviewed mappings", () => {
  const employee = {
    externalEmployeeId: "E-1", firstName: "Kay", lastName: "Rowe", preferredFirstName: null, emailAddress: "kay@example.com",
    employmentStatus: "active", positionId: "P-LM", positionName: "Location Manager", primaryLocationId: "W-66", primaryLocationName: "Kearney",
    additionalLocations: [{ wovenLocationId: "W-67", name: "Bellevue", number: null }, { wovenLocationId: "W-NEW", name: "New", number: null }],
    temporaryOrExpiringLocations: [], hasAllLocationAccess: false, dataIssues: [], missingSyncCount: 0,
  };
  const positions = [{ wovenPositionId: "P-LM", status: "mapped", role: "location_manager", scopeLevel: "location", isConfirmed: true }];
  const locations = [
    { wovenLocationId: "W-66", status: "mapped", locationCode: "66" },
    { wovenLocationId: "W-67", status: "mapped", locationCode: "67" },
    { wovenLocationId: "W-NEW", status: "unmapped", locationCode: null },
  ];
  const q = "?email=kay%40example.com";

  it("filters to the pinned Woven company, and a record outside it yields nothing", async () => {
    const { GET } = await load({ rows: [employee], tenant: [], positions, locations });
    seenTenantFilters.length = 0;
    const body = await (await GET(get(q))).json();
    expect(body).toEqual({ status: "not_found" });
    expect(seenTenantFilters).toEqual(["woven_company_id=55839f24-9241-418c-8405-37baf9a42a87"]);
  });

  it("suggests from a pinned-company record using only reviewed mappings", async () => {
    const { GET } = await load({ rows: [employee], tenant: ["E-1"], positions, locations });
    const body = await (await GET(get(q))).json();
    expect(body.status).toBe("found");
    expect(body.suggestion).toEqual({ displayName: "Kay Rowe", role: "location_manager", scopeLevel: "location", primaryAreaId: "loc-66", additionalAreaIds: ["loc-67"] });
    expect(body.notes.join(" ")).toContain("New"); // the unmapped one is reported, not suggested
  });

  it("an unreviewed (unmapped) primary location suggests no primary area", async () => {
    const { GET } = await load({ rows: [employee], tenant: ["E-1"], positions, locations: [{ wovenLocationId: "W-66", status: "unmapped", locationCode: "66" }, ...locations.slice(1)] });
    const body = await (await GET(get(q))).json();
    expect(body.suggestion.primaryAreaId).toBeNull();
  });
});
