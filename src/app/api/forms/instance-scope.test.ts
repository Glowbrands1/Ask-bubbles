import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessScope } from "@/types";

/**
 * ============================================================================
 * REMEDIATION FINDING 4 — AN HR RECORD THAT EXISTS IS NOT PUBLIC
 * ============================================================================
 *
 * WHAT WAS OPEN. Phase 2 authorized the location a form is CREATED against.
 * Nothing authorized the location of a form being read, edited, drafted,
 * finalized, archived, deleted or exported. Every per-instance route took an id
 * from the URL and served the row, and Form Monitoring listed every form in the
 * company to anybody holding `view_form_monitoring` — which is every manager
 * role.
 *
 * A location manager at location A who knew a UUID could open, edit, finalize and
 * delete a disciplinary record belonging to location B. Creation being locked while
 * everything after it was open is the worst shape this could have taken,
 * because it reads like the boundary exists.
 *
 * SECOND HOLE, SAME ROUTES. Every editing verb hard-coded one form's
 * permission, so a role that may write that form could save, draft, finalize
 * and set follow-ups on any other — permissions it does not hold.
 *
 * ============================================================================
 * EVERY FIXTURE HOLDS TWO LOCATIONS' DATA
 * ============================================================================
 *
 * A suite that seeds only the caller's own form proves nothing: a foreign id
 * would match nothing whatever the route did. So location B's form is real here,
 * and each group proves it is reachable BY SOMEBODY before proving the location-A
 * manager cannot reach it.
 */

const ORIGINAL = { ...process.env };

const LOCATION_A: AccessScope = {
  level: "location",
  primaryAreaId: "loc-a",
  alsoCoversAreaIds: [],
};

const MINE = "11111111-1111-4111-8111-111111111111";
const THEIRS = "22222222-2222-4222-8222-222222222222";
const ORPHAN = "33333333-3333-4333-8333-333333333333";
/** At the caller's OWN location, behind a permission the caller lacks, so only the permission can refuse it. */
const MY_EPP = "55555555-5555-4555-8555-555555555555";

interface Row {
  id: string;
  templateKey: string;
  locationId: string | null;
  createdBy: string;
  status: "draft" | "finalized" | "revised";
}

const ROWS: Record<string, Row> = {
  [MINE]: { id: MINE, templateKey: "fixture-coaching", locationId: "loc-a", createdBy: "user-a", status: "draft" },
  [THEIRS]: { id: THEIRS, templateKey: "fixture-corrective", locationId: "loc-b", createdBy: "user-b", status: "draft" },
  // No location at all — the case that must not become a way to opt out.
  [ORPHAN]: { id: ORPHAN, templateKey: "fixture-coaching", locationId: null, createdBy: "user-b", status: "draft" },
  [MY_EPP]: { id: MY_EPP, templateKey: "fixture-separation", locationId: "loc-a", createdBy: "user-a", status: "draft" },
};

/**
 * The templates the rows point at. Two any form-creating manager may edit, and
 * one behind `manage_form_records`, which a location manager does not hold and
 * a district manager does — so the per-template permission is what refuses it.
 */
const TEMPLATES: Record<string, Record<string, unknown>> = {
  "fixture-coaching": {
    id: "tpl-fixture-coaching",
    key: "fixture-coaching",
    name: "Fixture Coaching Note",
    shortName: "Coaching Note",
    description: "",
    layoutFamily: "coaching",
    requiredPermission: "create_forms",
    active: true,
    displayOrder: 1,
  },
  "fixture-corrective": {
    id: "tpl-fixture-corrective",
    key: "fixture-corrective",
    name: "Fixture Corrective Notice",
    shortName: "Corrective Notice",
    description: "",
    layoutFamily: "corrective",
    requiredPermission: "create_forms",
    active: true,
    displayOrder: 2,
  },
  "fixture-separation": {
    id: "tpl-fixture-separation",
    key: "fixture-separation",
    name: "Fixture Separation Record",
    shortName: "Separation Record",
    description: "",
    layoutFamily: "separation",
    requiredPermission: "manage_form_records",
    active: true,
    displayOrder: 4,
  },
};

function instanceRow(row: Row) {
  return {
    id: row.id,
    templateId: `tpl-${row.templateKey}`,
    templateKey: row.templateKey,
    templateName: String(TEMPLATES[row.templateKey]?.name ?? row.templateKey),
    templateShortName: row.templateKey,
    layoutFamily: "coaching",
    templateVersionId: "ver-1",
    templateVersion: 1,
    variantKey: null,
    employeeName: "Synthetic Person",
    employeeRole: null,
    locationId: row.locationId,
    locationName: null,
    createdBy: row.createdBy,
    createdByRole: "location_manager",
    source: "manual",
    status: row.status,
    formDate: "2026-09-07",
    followUpDate: null,
    followedUpAt: null,
    followedUpBy: null,
    finalizedAt: null,
    exportedAt: null,
    archivedAt: null,
    revisesInstanceId: null,
    createdAt: "2026-09-07T12:00:00Z",
    updatedAt: "2026-09-07T12:00:00Z",
  };
}

interface Touched {
  saved: string[];
  archived: string[];
  deleted: string[];
  finalized: string[];
}

async function load(
  options: {
    scope?: AccessScope | null;
    role?: string;
    demo?: boolean;
    /** The authenticated subject. Distinct per actor, so the creator branch is testable. */
    subject?: string;
  } = {},
) {
  const { scope = LOCATION_A, role = "location_manager", demo = false, subject = "user-a" } = options;

  process.env.NEXT_PUBLIC_DEMO_MODE = demo ? "true" : "false";
  vi.resetModules();

  const touched: Touched = { saved: [], archived: [], deleted: [], finalized: [] };

  vi.doMock("@/lib/auth/server", async () => {
    const { AuthError } = await import("@/lib/auth/types");
    const { DEFAULT_PERMISSION_MATRIX, hasPermission } = await import("@/lib/permissions");
    return {
      authorizeRequest: async (_request: Request, permission: string) => {
        if (!hasPermission(DEFAULT_PERMISSION_MATRIX, role as never, permission as never)) {
          throw new AuthError("forbidden", "Your role does not have permission to do that.");
        }
        return {
          identity: {
            subject,
            email: "a@example.com",
            displayName: "A",
            role,
            scope,
            verified: true,
          },
          permission,
          provider: "supabase",
        };
      },
    };
  });

  vi.doMock("@/lib/forms/repository", () => ({
    getTemplateByKey: async (key: string) => TEMPLATES[key] ?? null,
  }));

  vi.doMock("@/lib/forms/instances", () => ({
    loadInstance: async (id: string) => {
      const row = ROWS[id];
      if (!row) return null;
      return {
        instance: instanceRow(row),
        version: { id: "ver-1", document: { paper: "letter", blocks: [] }, variants: [] },
        values: [],
        events: [],
      };
    },
    /*
     * HONOURS THE FILTER, because the route's job is now to BUILD one. A mock
     * that ignored it would let a route that passed no filter at all — the
     * exact regression — go on passing.
     */
    listInstances: async (
      _view: string,
      _limit: number | undefined,
      filter?: { locationIds?: string[]; ownNullLocationCreatedBy?: string },
    ) => {
      const rows = Object.values(ROWS).map(instanceRow);
      if (!filter || filter.locationIds === undefined) return rows;
      return rows.filter(
        (row) =>
          (row.locationId !== null && filter.locationIds!.includes(row.locationId)) ||
          (row.locationId === null && row.createdBy === filter.ownNullLocationCreatedBy),
      );
    },
    findDemoInstances: async () => ({ deletable: Object.values(ROWS).map(instanceRow), protected: [] }),
    deleteDemoInstances: async () => ({ deleted: 0 }),
    saveInstanceValues: async (id: string) => {
      touched.saved.push(id);
      return { rejected: [] };
    },
    finalizeInstance: async (id: string) => {
      touched.finalized.push(id);
      return instanceRow(ROWS[id]!);
    },
    reviseInstance: async (id: string) => instanceRow(ROWS[id]!),
    archiveInstance: async (id: string) => {
      touched.archived.push(id);
      return instanceRow(ROWS[id]!);
    },
    deleteInstance: async (id: string) => {
      touched.deleted.push(id);
      return { id, employeeName: "Synthetic Person" };
    },
    createInstance: async () => ({ id: "new" }),
    InstanceProtectedError: class extends Error {},
    // The route imports it to turn an unacknowledged finalize into a 409.
    UnverifiedPolicyError: class extends Error {},
  }));

  const detail = await import("./instances/[id]/route");
  const list = await import("./instances/route");
  return { detail, list, touched };
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(method: string, body?: unknown): Request {
  return new Request("https://app.test/api/forms/instances/x", {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  for (const mod of ["@/lib/auth/server", "@/lib/forms/repository", "@/lib/forms/instances"]) {
    vi.doUnmock(mod);
  }
  vi.resetModules();
});

/* ============================================== the guard on the guard == */

describe("the fixture holds two locations' forms, and the caller's own is reachable", () => {
  it("serves location A's form to location A's manager", async () => {
    const { detail } = await load();
    const response = await detail.GET(req("GET"), params(MINE));

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { instance: { locationId: string } };
    expect(payload.instance.locationId).toBe("loc-a");
  });

  it("serves location B's form to a global actor, so it is genuinely there", async () => {
    const { detail } = await load({
      role: "owner",
      scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] },
    });
    const response = await detail.GET(req("GET"), params(THEIRS));
    expect(response.status).toBe(200);
  });
});

/* ================================================= reading someone else's */

describe("F4. a foreign form cannot be read by knowing its UUID", () => {
  it("answers 404, exactly as a missing form does", async () => {
    const { detail } = await load();
    const foreign = await detail.GET(req("GET"), params(THEIRS));
    const missing = await detail.GET(req("GET"), params("44444444-4444-4444-8444-444444444444"));

    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    /*
     * SAME STATUS AND SAME WORDING. A 403 would confirm that a guessed UUID
     * names a real record at somebody else's location — an existence oracle over
     * other people's HR history, one guess at a time.
     */
    expect(await foreign.json()).toEqual(await missing.json());
  });

  it("leaks nothing about the form in the refusal", async () => {
    const { detail } = await load();
    const body = await (await detail.GET(req("GET"), params(THEIRS))).text();

    expect(body).not.toContain("loc-b");
    expect(body).not.toContain("Synthetic Person");
    expect(body).not.toContain("Corrective");
  });
});

/* ================================================== writing to someone else's */

describe("F4. a foreign form cannot be written by knowing its UUID", () => {
  it("refuses a save, and stores nothing", async () => {
    const { detail, touched } = await load();
    const response = await detail.PATCH(
      req("PATCH", { values: { coaching_details: "injected" } }),
      params(THEIRS),
    );

    expect(response.status).toBe(404);
    expect(touched.saved).toEqual([]);
  });

  it("refuses finalizing, and finalizes nothing", async () => {
    const { detail, touched } = await load();
    const response = await detail.POST(req("POST", { action: "finalize" }), params(THEIRS));

    expect(response.status).toBe(404);
    expect(touched.finalized).toEqual([]);
  });

  it("refuses archiving, and archives nothing", async () => {
    /*
     * `manage_form_records` sits with the roles that administer Forms, and a
     * location manager does not hold it — so they get a 403 before the scope
     * check ever runs, which proves nothing about scope. Role and assignment
     * are independent columns on `app_users`, so the actor that tests THIS
     * boundary is one who holds the permission and covers one location.
     */
    const { detail, touched } = await load({ role: "district_manager", scope: LOCATION_A });
    const response = await detail.PUT(req("PUT", { archived: true }), params(THEIRS));

    expect(response.status).toBe(404);
    expect(touched.archived).toEqual([]);
  });

  it("refuses deleting, and deletes nothing", async () => {
    const { detail, touched } = await load({ role: "district_manager", scope: LOCATION_A });
    const response = await detail.DELETE(req("DELETE"), params(THEIRS));

    expect(response.status).toBe(404);
    expect(touched.deleted).toEqual([]);
  });

  it("still lets that actor archive a form at their OWN location", async () => {
    // The guard on the guard for the two above: the permission and the fixture
    // can reach the action, so the refusals are scope and not a blanket no.
    const { detail, touched } = await load({ role: "district_manager", scope: LOCATION_A });
    const response = await detail.PUT(req("PUT", { archived: true }), params(MINE));

    expect(response.status).toBe(200);
    expect(touched.archived).toEqual([MINE]);
  });

  it("still lets the caller save their OWN form", async () => {
    // The guard must not be a blanket refusal that looks like security.
    const { detail, touched } = await load();
    const response = await detail.PATCH(req("PATCH", { values: {} }), params(MINE));

    expect(response.status).toBe(200);
    expect(touched.saved).toEqual([MINE]);
  });
});

/* ======================================================= district / region */

describe("F4. a district or region the roster does not know fails closed here too", () => {
  it.each(["district", "region"] as const)("%s cannot read a location's form", async (level) => {
    const { detail } = await load({
      role: "district_manager",
      scope: { level, primaryAreaId: `${level}-01`, alsoCoversAreaIds: [] },
      // A different person from the form's creator — otherwise the "your own
      // work is always yours" branch fires and this measures nothing.
      subject: "user-dm",
    });

    expect((await detail.GET(req("GET"), params(MINE))).status).toBe(404);
  });
});

/* ============================================================== null location */

describe("F4. a form with no location belongs to whoever created it", () => {
  it("is refused to somebody else", async () => {
    // Otherwise `locationId: null` becomes the way to opt out of the boundary.
    const { detail } = await load();
    expect((await detail.GET(req("GET"), params(ORPHAN))).status).toBe(404);
  });

  it("is served to its creator", async () => {
    /*
     * The other half of the rule. A manager may legitimately create a form
     * naming no location — Phase 2 allows it, and older rows predate the column
     * being used. Refusing everybody would strand real work; allowing everybody
     * would make `locationId: null` the way out of the boundary. So it belongs
     * to whoever created it.
     */
    const { detail } = await load({ subject: "user-b" });
    expect((await detail.GET(req("GET"), params(ORPHAN))).status).toBe(200);
  });

  it("is served to a global actor", async () => {
    const { detail } = await load({
      role: "owner",
      scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] },
    });
    expect((await detail.GET(req("GET"), params(ORPHAN))).status).toBe(200);
  });
});

/* ====================================================== per-template permission */

describe("F4. the TEMPLATE's own permission gates editing, not a hard-coded one", () => {
  it("refuses an edit to a location manager, at their OWN location, on a form above their role", async () => {
    /*
     * THE HOLE, DEMONSTRATED. Every editing verb asked for one fixed
     * permission. A location manager holds `create_forms` and NOT
     * `manage_form_records` — the matrix gives that to district managers and
     * above — so under the old authorization they could save, draft, finalize
     * and set follow-ups on a record they have no authority over.
     *
     * The location is their own, so scope cannot be what refuses this. Only the
     * template's own permission can.
     */
    const { detail, touched } = await load();
    const response = await detail.PATCH(req("PATCH", { values: {} }), params(MY_EPP));

    expect(response.status).toBe(403);
    expect(touched.saved).toEqual([]);
  });

  it("refuses finalizing and follow-ups on it for the same reason", async () => {
    const { detail, touched } = await load();
    const finalize = await detail.POST(req("POST", { action: "finalize" }), params(MY_EPP));

    expect(finalize.status).toBe(403);
    expect(touched.finalized).toEqual([]);
  });

  it("allows a district manager, who does hold manage_form_records", async () => {
    // The guard on the guard: the form is reachable by somebody, so the refusal
    // above is the permission and not a broken fixture.
    const { detail, touched } = await load({ role: "district_manager", scope: LOCATION_A });
    const response = await detail.PATCH(req("PATCH", { values: {} }), params(MY_EPP));

    expect(response.status).toBe(200);
    expect(touched.saved).toEqual([MY_EPP]);
  });

  it("still lets a location manager edit the coaching note at their location", async () => {
    const { detail, touched } = await load();
    expect((await detail.PATCH(req("PATCH", { values: {} }), params(MINE))).status).toBe(200);
    expect(touched.saved).toEqual([MINE]);
  });

  it("resolves the permission from the stored instance's template", () => {
    const source = readFileSync("src/lib/forms/instance-scope.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    expect(source).toContain("getTemplateByKey(instance.templateKey)");
    expect(source).toContain("template?.requiredPermission");
  });

  it("leaves no hard-coded form permission on any instance route", () => {
    const routes = [
      "src/app/api/forms/instances/[id]/route.ts",
      "src/app/api/forms/instances/[id]/draft/route.ts",
      "src/app/api/forms/instances/[id]/follow-up/route.ts",
      "src/app/api/forms/instances/[id]/pdf/route.ts",
    ];

    for (const path of routes) {
      const source = readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");

      expect(source, path).not.toContain('"create_coaching_form"');
      expect(source, path).not.toContain('"create_forms"');
      // And every verb goes through the scoped guard.
      expect(source, path).toContain("authorizeInstance(");
    }
  });
});

/* ================================================== Form Monitoring listing */

describe("F4. Form Monitoring is scope-filtered on the server", () => {
  it("returns only the forms the caller may see", async () => {
    const { list } = await load();
    const response = await list.GET(new Request("https://app.test/api/forms/instances"));
    const payload = (await response.json()) as { instances: { id: string }[] };

    expect(payload.instances.map((entry) => entry.id)).toEqual([MINE, MY_EPP]);
  });

  it("returns everything to a global actor, so the filter is real", async () => {
    const { list } = await load({
      role: "owner",
      scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] },
    });
    const payload = (await (
      await list.GET(new Request("https://app.test/api/forms/instances"))
    ).json()) as { instances: { id: string }[] };

    expect(payload.instances).toHaveLength(4);
  });

  it("scopes the demo sweep count too", async () => {
    // A count of forms the caller cannot see would offer a "Delete 3" that
    // removed one, and would leak how many exist elsewhere.
    const { list } = await load();
    const payload = (await (
      await list.GET(new Request("https://app.test/api/forms/instances"))
    ).json()) as { demo: { deletable: number } };

    expect(payload.demo.deletable).toBe(2);
  });

  it("filters on the server, not in the screen", () => {
    const route = readFileSync("src/app/api/forms/instances/route.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    // The rows must not cross the wire at all — the endpoint is callable
    // without the screen.
    expect(route).toContain("visibleInstances(actor,");
  });

  it("narrows the QUERY as well as the result", () => {
    /*
     * Both mechanisms, deliberately: the query decides what is READ so an
     * authorized row older than the limit still arrives, and the predicate
     * re-checks what is RETURNED so a drift between them fails closed.
     */
    const route = readFileSync("src/app/api/forms/instances/route.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    expect(route).toContain("instanceListFilterFor(actor)");
  });

  it("passes a filter that names the caller's own locations", async () => {
    // Driven through the route, so a route that stopped building a filter would
    // fail here even though the predicate still ran.
    const { list } = await load();
    const payload = (await (
      await list.GET(new Request("https://app.test/api/forms/instances"))
    ).json()) as { instances: { id: string }[] };

    expect(payload.instances.map((entry) => entry.id)).toEqual([MINE, MY_EPP]);
  });
});

describe("F4. preview mode is not enforced against a browser-asserted scope", () => {
  it("serves every form when there is no verified identity", async () => {
    const { list } = await load({ demo: true, scope: null });
    const request = new Request("https://app.test/api/forms/instances", {
      headers: { "x-ask-bubbles-demo-role": "location_manager" },
    });
    const payload = (await (await list.GET(request)).json()) as { instances: unknown[] };

    expect(payload.instances).toHaveLength(4);
  });
});


/* ==================================================================== */
/*  REMEDIATION 2, FINDING 2 — THE CREATOR EXCEPTION IS ABOUT AN        */
/*  ABSENT LOCATION, NOT AN OVERRIDE OF A PRESENT ONE                      */
/* ==================================================================== */

/**
 * ============================================================================
 * THE TRANSFERRED MANAGER
 * ============================================================================
 *
 * `createdBy === actor.id` was tested BEFORE the location rule, so authorship
 * overrode assignment:
 *
 *   A manager files a coaching record at location A.
 *   They transfer; their scope becomes location B.
 *   Their AccessScope no longer covers location A at all.
 *   They could still open, edit, finalize, archive, delete and export that
 *   record — because they had once created it.
 *
 * Authorization here answers "may this person see this location's HR records
 * TODAY", and the answer changed when they moved. It also punched through the
 * district/region fail-closed rule for any historical record those actors had
 * created themselves.
 */
describe("R2-F2. a transferred manager loses access to the location they left", () => {
  /** Same person, now assigned somewhere else entirely. */
  const TRANSFERRED = {
    role: "district_manager",
    subject: "user-a",
    scope: {
      level: "location" as const,
      primaryAreaId: "loc-b",
      alsoCoversAreaIds: [] as string[],
    },
  };

  it("cannot read the record they created at their old location", async () => {
    // MINE is `createdBy: "user-a"`, `locationId: "loc-a"`.
    const { detail } = await load(TRANSFERRED);
    expect((await detail.GET(req("GET"), params(MINE))).status).toBe(404);
  });

  it("cannot write to it either", async () => {
    const { detail, touched } = await load(TRANSFERRED);

    expect((await detail.PATCH(req("PATCH", { values: {} }), params(MINE))).status).toBe(404);
    expect((await detail.POST(req("POST", { action: "finalize" }), params(MINE))).status).toBe(404);
    expect((await detail.PUT(req("PUT", { archived: true }), params(MINE))).status).toBe(404);
    expect((await detail.DELETE(req("DELETE"), params(MINE))).status).toBe(404);

    expect(touched).toEqual({ saved: [], archived: [], deleted: [], finalized: [] });
  });

  it("does not see it in Form Monitoring", async () => {
    const { list } = await load(TRANSFERRED);
    const payload = (await (
      await list.GET(new Request("https://app.test/api/forms/instances"))
    ).json()) as { instances: { id: string }[] };

    expect(payload.instances.map((entry) => entry.id)).not.toContain(MINE);
  });

  it("regains it if they are assigned back — the rule is CURRENT scope", async () => {
    // The guard on the guard: nothing about the record changed, so the refusals
    // above are the scope and not something broken about the fixture.
    const { detail } = await load({ subject: "user-a", scope: LOCATION_A });
    expect((await detail.GET(req("GET"), params(MINE))).status).toBe(200);
  });

  it("still reaches their own record that names NO location", async () => {
    /*
     * The exception, in the only place it belongs. ORPHAN has
     * `locationId: null` and `createdBy: "user-b"`, so the creator is the only
     * non-global actor who can reach it — wherever they are assigned now.
     */
    const { detail } = await load({
      subject: "user-b",
      scope: { level: "location", primaryAreaId: "loc-zzz", alsoCoversAreaIds: [] },
    });
    expect((await detail.GET(req("GET"), params(ORPHAN))).status).toBe(200);
  });

  it("does not let a district actor reach a location record they created", async () => {
    // Fail-closed was being punched through for historical records too.
    const { detail } = await load({
      role: "district_manager",
      subject: "user-a",
      scope: { level: "district", primaryAreaId: "dist-01", alsoCoversAreaIds: [] },
    });
    expect((await detail.GET(req("GET"), params(MINE))).status).toBe(404);
  });
});
