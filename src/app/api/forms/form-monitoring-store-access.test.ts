import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessScope } from "@/types";

/**
 * ============================================================================
 * FORM MONITORING IS HOME-STORE ONLY — EXCEPT ADMINISTRATORS AND DESIGNATED ACCOUNTS
 * ============================================================================
 *
 * REGRESSION. Form Monitoring, the Overview queue and the rail badge read every
 * store's forms, and the stored `global` scope (every account carries it) was
 * treated as "all stores". Visibility is now decided by `resolveFormsVisibility`:
 * administrator role, or an unrevoked `forms_all_store_access` row of mode
 * `all`, reads all stores; anyone else reads their assigned stores plus every
 * store Woven assigns them; no store at all reads nothing.
 *
 * The fixture holds forms at THREE stores, each reachable by somebody, so a
 * refusal means the rule worked rather than that the row was never there.
 */

const ORIGINAL = { ...process.env };

const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const STORE_A: AccessScope = { level: "location", primaryAreaId: "loc-a", alsoCoversAreaIds: [] };

const FORM_A = "11111111-1111-4111-8111-111111111111";
const FORM_B = "22222222-2222-4222-8222-222222222222";
const FORM_C = "33333333-3333-4333-8333-333333333333";
const ROWS: Record<string, string> = { [FORM_A]: "loc-a", [FORM_B]: "loc-b", [FORM_C]: "loc-c" };

const row = (id: string, createdBy = "someone-else") => ({
  id,
  templateId: "tpl",
  templateKey: "coaching",
  templateName: "Coaching Form",
  templateShortName: "Coaching",
  layoutFamily: "coaching",
  templateVersionId: "ver-1",
  templateVersion: 1,
  variantKey: null,
  employeeName: "Synthetic Person",
  employeeRole: null,
  locationId: ROWS[id]!,
  locationName: null,
  createdBy,
  createdByRole: "location_manager",
  source: "manual",
  status: "draft",
  formDate: "2026-09-07",
  followUpDate: "2026-09-01",
  followedUpAt: null,
  followedUpBy: null,
  finalizedAt: null,
  exportedAt: null,
  archivedAt: null,
  revisesInstanceId: null,
  createdAt: "2026-09-07T12:00:00Z",
  updatedAt: "2026-09-07T12:00:00Z",
});

interface Options {
  subject: string;
  role: string;
  scope: AccessScope;
  /** Subjects with an unrevoked designation row of mode `all`. */
  designated?: string[];
  /** Subjects designated for their Woven stores only. */
  wovenDesignated?: string[];
  /** Woven affiliations by app user id (active ones); `loc` is the Woven location id. */
  affiliations?: Record<string, { loc: string; expires_on?: string | null }[]>;
  /**
   * Woven's location map: Woven location id -> company store id when `mapped`,
   * or null when a person marked it `ignored` (an office, Corporate). A Woven
   * location absent here is still `unmapped`.
   */
  locationMap?: Record<string, string | null>;
  /** Make the Woven affiliation lookup fail. */
  affiliationsFail?: boolean;
  /** Woven's mapped primary store, by app user id. */
  woven?: Record<string, string | null>;
  /** Make the designation lookup fail. */
  designationFails?: boolean;
  /** Forms this subject created, by form id. */
  created?: string[];
}

async function load(options: Options) {
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  vi.resetModules();

  vi.doMock("@/lib/auth/server", async () => {
    const { AuthError } = await import("@/lib/auth/types");
    const { DEFAULT_PERMISSION_MATRIX, hasPermission } = await import("@/lib/permissions");
    return {
      authorizeRequest: async (_request: Request, permission: string) => {
        if (!hasPermission(DEFAULT_PERMISSION_MATRIX, options.role as never, permission as never)) {
          throw new AuthError("forbidden", "Your role does not have permission to do that.");
        }
        return {
          identity: {
            subject: options.subject,
            email: "x@example.com",
            displayName: "X",
            role: options.role,
            scope: options.scope,
            verified: true,
          },
          permission,
          provider: "supabase",
        };
      },
    };
  });

  /* The lookups the visibility rule makes, answered from the options. */
  vi.doMock("@/lib/supabase/server", () => ({
    getSupabaseAdmin: () => ({
      from: (table: string) => {
        const f: { eq: Record<string, unknown>; in?: string[]; select?: string } = { eq: {} };
        const rows = () => {
          if (table === "employee_access_preview") {
            const id = f.eq.app_user_id as string;
            if (!options.woven || !(id in options.woven)) return [];
            return [{ employee_id: `emp-${id}`, mapped_primary_location_id: options.woven[id] }];
          }
          if (table === "employee_location_affiliations") {
            const subject = String(f.eq.employee_id).replace("emp-", "");
            return (options.affiliations?.[subject] ?? []).map((a) => ({
              woven_location_id: a.loc,
              expires_on: a.expires_on ?? null,
            }));
          }
          if (table === "woven_location_map") {
            return (f.in ?? [])
              .filter((id) => options.locationMap && id in options.locationMap)
              .map((id) => {
                const store = options.locationMap![id] ?? null;
                return { location_id: store, status: store ? "mapped" : "ignored" };
              })
              .filter((r) => f.eq.status === undefined || r.status === f.eq.status);
          }
          return [];
        };
        const builder = {
          select: (columns: string) => ((f.select = columns), builder),
          eq: (column: string, value: unknown) => ((f.eq[column] = value), builder),
          is: () => builder,
          in: (_column: string, values: string[]) => ((f.in = values), builder),
          limit: async () => ({ data: rows(), error: null }),
          maybeSingle: async () => {
            if (options.designationFails) return { data: null, error: { message: "column does not exist" } };
            const id = f.eq.app_user_id as string;
            if (options.designated?.includes(id)) return { data: { visibility_mode: "all" }, error: null };
            if (options.wovenDesignated?.includes(id)) {
              return { data: { visibility_mode: "woven_affiliations" }, error: null };
            }
            return { data: null, error: null };
          },
          then: (resolve: (value: unknown) => unknown) =>
            resolve(
              table === "employee_location_affiliations" && options.affiliationsFail
                ? { data: null, error: { message: "relation does not exist" } }
                : { data: rows(), error: null },
            ),
        };
        return builder;
      },
    }),
  }));

  vi.doMock("@/lib/forms/repository", () => ({
    getTemplateByKey: async () => ({
      id: "tpl",
      key: "coaching",
      name: "Coaching Form",
      shortName: "Coaching",
      description: "",
      layoutFamily: "coaching",
      requiredPermission: "create_coaching_form",
      active: true,
      displayOrder: 1,
    }),
  }));

  /* Each row, carrying this subject as its creator when the options say so. */
  const rowFor = (id: string) => row(id, options.created?.includes(id) ? options.subject : "someone-else");

  vi.doMock("@/lib/forms/instances", () => ({
    loadInstance: async (id: string) =>
      ROWS[id]
        ? { instance: rowFor(id), version: { id: "v", document: { paper: "letter", blocks: [] }, variants: [] }, values: [], events: [] }
        : null,
    listInstances: async (
      _view: string,
      _limit: number | undefined,
      filter?: { locationIds?: string[]; ownNullLocationCreatedBy?: string; ownCreatedBy?: string },
    ) => {
      const rows = Object.keys(ROWS).map(rowFor);
      if (!filter || filter.locationIds === undefined) return rows;
      return rows.filter(
        (r) =>
          filter.locationIds!.includes(r.locationId) ||
          (filter.ownCreatedBy !== undefined && r.createdBy === filter.ownCreatedBy),
      );
    },
    findDemoInstances: async () => ({ deletable: Object.keys(ROWS).map(rowFor), protected: [] }),
    listOutstandingFollowUps: async (_limit: number, ids: string[] | null, own?: string | null) =>
      Object.keys(ROWS)
        .map(rowFor)
        .filter((r) => ids === null || ids.includes(r.locationId) || (!!own && r.createdBy === own)),
    markExported: async () => undefined,
    InstanceProtectedError: class extends Error {},
    UnverifiedPolicyError: class extends Error {},
  }));

  const detail = await import("./instances/[id]/route");
  const list = await import("./instances/route");
  const { pageFormsAccess } = await import("@/lib/forms/page-scope");
  const { visibleInstances } = await import("@/lib/forms/instance-scope");
  const { listOutstandingFollowUps } = await import("@/lib/forms/instances");
  return { detail, list, pageFormsAccess, visibleInstances, listOutstandingFollowUps };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (path = "/api/forms/instances") => new Request(`https://app.test${path}`);

async function listedIds(options: Options): Promise<string[]> {
  const { list } = await load(options);
  const payload = (await (await list.GET(get())).json()) as { instances: { id: string }[] };
  return payload.instances.map((entry) => entry.id).sort();
}

const identity = (o: Options) => ({
  subject: o.subject,
  role: o.role as never,
  scope: o.scope,
  verified: true,
  email: "x@example.com",
  displayName: "X",
});

beforeEach(() => vi.resetModules());
afterEach(() => {
  process.env = { ...ORIGINAL };
  for (const mod of ["@/lib/auth/server", "@/lib/supabase/server", "@/lib/forms/repository", "@/lib/forms/instances"]) {
    vi.doUnmock(mod);
  }
  vi.resetModules();
});

const EMPLOYEE: Options = { subject: "emp", role: "assistant_manager", scope: STORE_A };
const STORE_MANAGER: Options = { subject: "sm", role: "location_manager", scope: STORE_A };
const DELPHINE: Options = { subject: "delphine", role: "district_manager", scope: GLOBAL, designated: ["delphine"] };
const RM: Options = { subject: "rm", role: "regional_manager", scope: GLOBAL, designated: ["rm"] };
const ADMIN: Options = { subject: "admin", role: "admin", scope: GLOBAL };
/* A District Manager with global scope, NO designation and one Woven store: that store only. */
const AMBER: Options = {
  subject: "amber",
  role: "district_manager",
  scope: GLOBAL,
  woven: { amber: "loc-b" },
  designated: ["delphine", "rm"],
};
/* Designated for her Woven stores: home store loc-b plus additional loc-c, Corporate (unmapped) ignored. */
const AMBER_WOVEN: Options = {
  subject: "amber",
  role: "district_manager",
  scope: GLOBAL,
  woven: { amber: "loc-b" },
  wovenDesignated: ["amber"],
  affiliations: { amber: [{ loc: "w-b" }, { loc: "w-c" }, { loc: "w-corporate" }] },
  locationMap: { "w-b": "loc-b", "w-c": "loc-c" },
};
const NO_STORE: Options = { subject: "nobody", role: "location_manager", scope: GLOBAL, woven: {} };

describe("the list API: who sees which stores' forms", () => {
  it("a regular employee sees only their home store", async () => {
    expect(await listedIds(EMPLOYEE)).toEqual([FORM_A]);
  });
  it("a store manager sees only their home store", async () => {
    expect(await listedIds(STORE_MANAGER)).toEqual([FORM_A]);
  });
  it("Delphine (designated) sees every store", async () => {
    expect(await listedIds(DELPHINE)).toEqual([FORM_A, FORM_B, FORM_C]);
  });
  it("RM (designated) sees every store", async () => {
    expect(await listedIds(RM)).toEqual([FORM_A, FORM_B, FORM_C]);
  });
  it("an admin sees every store", async () => {
    expect(await listedIds(ADMIN)).toEqual([FORM_A, FORM_B, FORM_C]);
  });
  it("another District Manager with global scope sees only their Woven home store", async () => {
    expect(await listedIds(AMBER)).toEqual([FORM_B]);
  });
  it("a Regional Manager with global scope and no designation sees only their home store", async () => {
    expect(
      await listedIds({ subject: "rm", role: "regional_manager", scope: GLOBAL, woven: { rm: "loc-c" } }),
    ).toEqual([FORM_C]);
  });
  it("a manager with no resolvable home store sees nothing, never everything", async () => {
    expect(await listedIds(NO_STORE)).toEqual([]);
  });
  it("a store Woven has not mapped is no store", async () => {
    expect(await listedIds({ ...NO_STORE, woven: { nobody: null } })).toEqual([]);
  });
  it("the demo-sweep counts leak no other store", async () => {
    const { list } = await load(STORE_MANAGER);
    const payload = (await (await list.GET(get())).json()) as { demo: { deletable: number } };
    expect(payload.demo.deletable).toBe(1);
  });
});

describe("a Woven-affiliation designation reads the home store plus the person's other Woven stores", () => {
  it("lists her home store and her additional stores, and not a store Woven does not list", async () => {
    expect(await listedIds(AMBER_WOVEN)).toEqual([FORM_B, FORM_C]);
  });
  it("opens her additional store's form by URL, and refuses the store she is not on", async () => {
    const { detail } = await load(AMBER_WOVEN);
    expect((await detail.GET(get(), params(FORM_B))).status).toBe(200);
    expect((await detail.GET(get(), params(FORM_C))).status).toBe(200);
    expect((await detail.GET(get(), params(FORM_A))).status).toBe(404);
  });
  it("ignores an expired affiliation", async () => {
    expect(
      await listedIds({
        ...AMBER_WOVEN,
        affiliations: { amber: [{ loc: "w-b" }, { loc: "w-c", expires_on: "2020-01-01" }] },
      }),
    ).toEqual([FORM_B]);
  });
  it("ignores an affiliation Woven's map has not resolved to a store", async () => {
    expect(await listedIds({ ...AMBER_WOVEN, locationMap: { "w-b": "loc-b" } })).toEqual([FORM_B]);
  });
  it("falls back to the home store when Woven lists no affiliations", async () => {
    expect(await listedIds({ ...AMBER_WOVEN, affiliations: {}, locationMap: {} })).toEqual([FORM_B]);
  });
  it("reads nothing when Woven offers no store at all", async () => {
    expect(await listedIds({ ...AMBER_WOVEN, woven: {}, affiliations: {}, locationMap: {} })).toEqual([]);
  });
  it("is not all-store access: Delphine's mode still is, Amber's is not", async () => {
    expect(await listedIds(DELPHINE)).toEqual([FORM_A, FORM_B, FORM_C]);
    expect(await listedIds(AMBER_WOVEN)).not.toContain(FORM_A);
  });
  it("a designation that cannot be read is never all-store access", async () => {
    expect(await listedIds({ ...AMBER_WOVEN, designationFails: true })).toEqual([FORM_B, FORM_C]);
  });
  it("is what everybody now gets: the same account undesignated reads the same stores", async () => {
    expect(await listedIds({ ...AMBER_WOVEN, wovenDesignated: [] })).toEqual([FORM_B, FORM_C]);
  });
});

/*
 * MULTIPLE STORES (21 Oct 2026). Every person reads the forms at each store
 * Woven assigns them — the primary, and each active additional or unexpired
 * temporary location mapped to a store — added to any store-scoped assignment.
 */
describe("a person Woven assigns to several stores", () => {
  const MULTI: Options = {
    subject: "multi",
    role: "district_manager",
    scope: GLOBAL,
    woven: { multi: "loc-a" },
    affiliations: { multi: [{ loc: "w-a" }, { loc: "w-b" }] },
    locationMap: { "w-a": "loc-a", "w-b": "loc-b" },
  };
  it("sees the forms at each of their Woven stores, and opens them", async () => {
    expect(await listedIds(MULTI)).toEqual([FORM_A, FORM_B]);
    const { detail } = await load(MULTI);
    expect((await detail.GET(get(), params(FORM_B))).status).toBe(200);
    expect((await detail.GET(get(), params(FORM_C))).status).toBe(404);
  });
  it("adds Woven's stores to a store-scoped manager's assignment", async () => {
    expect(
      await listedIds({
        ...STORE_MANAGER,
        woven: { sm: "loc-a" },
        affiliations: { sm: [{ loc: "w-c" }] },
        locationMap: { "w-c": "loc-c" },
      }),
    ).toEqual([FORM_A, FORM_C]);
  });
  it("keeps a store-scoped employee's own assignment when Woven offers more", async () => {
    expect(
      await listedIds({
        ...EMPLOYEE,
        woven: { emp: "loc-b" },
        affiliations: { emp: [{ loc: "w-b" }] },
        locationMap: { "w-b": "loc-b" },
      }),
    ).toEqual([FORM_A, FORM_B]);
  });
  it("reads a temporary store until its access expires", async () => {
    const temporary = (expires_on: string) => ({
      ...MULTI,
      affiliations: { multi: [{ loc: "w-a" }, { loc: "w-b", expires_on }] },
    });
    expect(await listedIds(temporary("2099-01-01"))).toEqual([FORM_A, FORM_B]);
    expect(await listedIds(temporary("2020-01-01"))).toEqual([FORM_A]);
  });
  it("skips a Woven location that is unmapped or ignored", async () => {
    expect(await listedIds({ ...MULTI, locationMap: { "w-a": "loc-a" } })).toEqual([FORM_A]);
    expect(await listedIds({ ...MULTI, locationMap: { "w-a": "loc-a", "w-b": null } })).toEqual([FORM_A]);
  });
  it("grants nothing extra when the Woven lookup fails", async () => {
    expect(await listedIds({ ...MULTI, affiliationsFail: true })).toEqual([FORM_A]);
  });
  it("leaves administrators and all-store accounts unchanged", async () => {
    expect(await listedIds({ ...MULTI, role: "admin" })).toEqual([FORM_A, FORM_B, FORM_C]);
    expect(await listedIds({ ...MULTI, designated: ["multi"] })).toEqual([FORM_A, FORM_B, FORM_C]);
  });
  it("puts every store on the page reads, the queue and the badge too", async () => {
    const { pageFormsAccess } = await load(MULTI);
    expect(await pageFormsAccess(identity(MULTI))).toMatchObject({
      locationIds: ["loc-a", "loc-b"],
      noStore: false,
    });
  });
});

describe("designation fails closed", () => {
  it("a revoked or absent designation grants nothing", async () => {
    expect(await listedIds({ ...DELPHINE, designated: [] })).toEqual([]);
  });
  it("a failing designation lookup (table missing) grants nothing", async () => {
    expect(await listedIds({ ...DELPHINE, designationFails: true })).toEqual([]);
  });
  it("a failing lookup does not take administrators down", async () => {
    expect(await listedIds({ ...ADMIN, designationFails: true })).toEqual([FORM_A, FORM_B, FORM_C]);
  });
  it("a designation belongs to one account id, not to a name", async () => {
    expect(
      await listedIds({ subject: "other", role: "district_manager", scope: GLOBAL, designated: ["delphine"] }),
    ).toEqual([]);
  });
});

describe("direct URL / API access to another store's form", () => {
  it("answers 404, exactly as a missing form does, for an employee and a store manager", async () => {
    for (const who of [EMPLOYEE, STORE_MANAGER]) {
      const { detail } = await load(who);
      const refused = await detail.GET(get(), params(FORM_B));
      const missing = await detail.GET(get(), params("99999999-9999-4999-8999-999999999999"));
      expect(refused.status).toBe(404);
      expect(await refused.json()).toEqual(await missing.json());
    }
  });
  it("answers 404 for a global-scope manager with no designation", async () => {
    const { detail } = await load(AMBER);
    expect((await detail.GET(get(), params(FORM_A))).status).toBe(404);
    expect((await detail.GET(get(), params(FORM_B))).status).toBe(200);
  });
  /*
   * REGRESSION (21 Oct 2026). Reads are scoped to the home store (#57), but
   * creating is authorized on the STORED scope, so a District Manager whose
   * scope covers several stores created a form at one that is not their home
   * store, and the inline card's very next fetch said "This form is not
   * available". The creator may open their own form while their stored scope
   * still covers its store.
   */
  it("serves a form its creator just created at a store outside their home store", async () => {
    const { detail } = await load({ ...AMBER, created: [FORM_C] });
    expect((await detail.GET(get(), params(FORM_C))).status).toBe(200);
    expect((await detail.GET(get(), params(FORM_A))).status).toBe(404);
  });
  it("lets the creator keep editing it", async () => {
    await load({ ...AMBER, created: [FORM_C] });
    const { authorizeInstance } = await import("@/lib/forms/instance-scope");
    await expect(authorizeInstance(get(), FORM_C, "edit")).resolves.toMatchObject({
      loaded: { instance: { id: FORM_C } },
    });
  });
  it("refuses the creator once their stored scope no longer covers the store", async () => {
    const { detail } = await load({ ...STORE_MANAGER, created: [FORM_B] });
    expect((await detail.GET(get(), params(FORM_B))).status).toBe(404);
  });
  it("lists the creator's own form at another store in Form Monitoring", async () => {
    expect(await listedIds({ ...AMBER, created: [FORM_C] })).toEqual([FORM_B, FORM_C]);
  });
  it("does not list it once their stored scope no longer covers that store", async () => {
    expect(await listedIds({ ...STORE_MANAGER, created: [FORM_B] })).toEqual([FORM_A]);
  });
  it("answers 404 for a user with no home store", async () => {
    const { detail } = await load(NO_STORE);
    for (const id of Object.keys(ROWS)) expect((await detail.GET(get(), params(id))).status).toBe(404);
  });
  it("serves every store's form to Delphine, RM and an admin", async () => {
    for (const who of [DELPHINE, RM, ADMIN]) {
      const { detail } = await load(who);
      for (const id of Object.keys(ROWS)) expect((await detail.GET(get(), params(id))).status).toBe(200);
    }
  });
  it("the PDF export route authorizes through the same per-instance guard", () => {
    expect(readFileSync("src/app/api/forms/instances/[id]/pdf/route.ts", "utf8")).toMatch(
      /authorizeInstance\(request, id, "view"\)/,
    );
  });
});

describe("the server pages (Form Monitoring, Overview, rail badge) apply the same scope", () => {
  it("narrows the page read and its counts to the reader's home store", async () => {
    const { pageFormsAccess, visibleInstances, listOutstandingFollowUps } = await load(STORE_MANAGER);
    const access = await pageFormsAccess(identity(STORE_MANAGER));
    expect(access).toMatchObject({ locationIds: ["loc-a"], noStore: false });
    const counted = visibleInstances(access.actor, await listOutstandingFollowUps(50, access.locationIds));
    expect(counted.map((r) => r.id)).toEqual([FORM_A]);
  });
  it("puts the reader's own forms at other stores in the queue and the badge", async () => {
    const who = { ...AMBER, created: [FORM_C] };
    const { pageFormsAccess, visibleInstances, listOutstandingFollowUps } = await load(who);
    const access = await pageFormsAccess(identity(who));
    expect(access).toMatchObject({ locationIds: ["loc-b"], ownCreatedBy: "amber" });
    const counted = visibleInstances(
      access.actor,
      await listOutstandingFollowUps(50, access.locationIds, access.ownCreatedBy),
    );
    expect(counted.map((r) => r.id)).toEqual([FORM_B, FORM_C]);
  });
  it("drops them from the queue once the stored scope no longer covers the store", async () => {
    const who = { ...STORE_MANAGER, created: [FORM_B] };
    const { pageFormsAccess, visibleInstances, listOutstandingFollowUps } = await load(who);
    const access = await pageFormsAccess(identity(who));
    const counted = visibleInstances(
      access.actor,
      await listOutstandingFollowUps(50, access.locationIds, access.ownCreatedBy),
    );
    expect(counted.map((r) => r.id)).toEqual([FORM_A]);
  });
  it("tells a reader with no home store so, and reads nothing", async () => {
    const { pageFormsAccess } = await load(NO_STORE);
    expect(await pageFormsAccess(identity(NO_STORE))).toMatchObject({ locationIds: [], noStore: true });
  });
  it("leaves designated accounts and admins unrestricted", async () => {
    for (const who of [DELPHINE, RM, ADMIN]) {
      const { pageFormsAccess } = await load(who);
      expect(await pageFormsAccess(identity(who))).toMatchObject({ locationIds: null, noStore: false });
    }
  });
  it("no page reads forms without the reader's scope", () => {
    for (const file of [
      "src/app/(app)/forms/monitoring/page.tsx",
      "src/app/(app)/page.tsx",
      "src/app/(app)/layout.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toMatch(/pageFormsAccess\(/);
      expect(source, file).toMatch(/visibleInstances\(/);
      expect(source, file).not.toMatch(/listOutstandingFollowUps\(\)/);
      if (source.includes("listOutstandingFollowUps(")) {
        // The queue reads the reader's own forms at other stores too.
        // Changed on purpose (27 Oct 2026): PRIVATE_CREATOR_FORMS_ENABLED reads the page of 50 as
        // privateAwareLimit(50), which is 50 itself with the flag off; the scope arguments are unchanged.
        expect(source, file).toMatch(/listOutstandingFollowUps\((?:50|privateAwareLimit\(50\)), [\w.]+, access\.ownCreatedBy\)/);
      }
      expect(source, file).not.toMatch(/listInstances\(view satisfies InstanceView\)/);
    }
  });
  it("the all-store list is data, not code: no user id is hardcoded in the visibility module", () => {
    expect(readFileSync("src/lib/forms/forms-visibility.ts", "utf8")).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
  });
});

describe("the designation table is server-only", () => {
  it("is locked down like every forms table, and seeds only existing accounts", () => {
    const sql = readFileSync("supabase/migrations/20261019001000_forms_all_store_access.sql", "utf8");
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/force row level security/);
    expect(sql).toMatch(/revoke all on public\.forms_all_store_access from anon, authenticated/);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toMatch(/from public\.app_users u where u\.id =/);
  });
  it("adds the Woven mode without changing any existing designation", () => {
    const sql = readFileSync("supabase/migrations/20261019002000_forms_store_access_woven_mode.sql", "utf8");
    expect(sql).toMatch(/default 'all'/);
    expect(sql).toMatch(/check \(visibility_mode in \('all', 'woven_affiliations'\)\)/);
    expect(sql).not.toMatch(/\b(delete|drop|truncate)\b/i);
    expect(sql).not.toMatch(/update public\.forms_all_store_access/i);
  });
});
