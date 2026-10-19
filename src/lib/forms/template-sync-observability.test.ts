import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { AuthError } from "@/lib/auth/types";
import { DEFAULT_PERMISSION_MATRIX, hasPermission } from "@/lib/permissions";
import type { Role } from "@/types";

/**
 * ============================================================================
 * THE TEMPLATE SYNC IS OBSERVABLE: ITS RESULT, ITS FAILURES AND ITS GUARDS
 * ============================================================================
 *
 * After PR #43 production's template sync did not run, and nothing on the
 * server could say why: a failure was caught by the Form Templates page and
 * shown on screen only. These tests pin the behaviour that makes the next run
 * legible:
 *
 *   who may trigger it, and where it may run;
 *   that a first run publishes the expected revisions and a second publishes
 *   nothing more;
 *   that one template failing is reported accurately and does not stop the
 *   rest, with the failure logged as one redacted structured line;
 *   that the administrator is shown what happened.
 *
 * The fake database never returns an error by itself, so faults are injected
 * by wrapping the client below.
 */

const store: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
};

const supabaseCalls = vi.hoisted(() => ({ count: 0 }));
const faults = vi.hoisted(() => ({
  /** Template keys whose NEW (version > 1) row insert fails, with the message. */
  failVersionInsertFor: new Map<string, string>(),
  /** Template keys whose pointer move onto a version > 1 fails (the version row is already stored). */
  failPointerFor: new Map<string, string>(),
  /** Template keys whose archiving of a published version fails. */
  failArchiveFor: new Map<string, string>(),
  /** When set, reading the template list fails with this message. */
  failLibraryRead: null as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => {
    supabaseCalls.count += 1;
    const base = fakeSupabase(store);
    return {
      ...base,
      from(table: string) {
        const query = base.from(table) as unknown as Record<string, unknown> & {
          insert: (payload: Record<string, unknown>) => unknown;
          select: (...args: unknown[]) => unknown;
        };
        if (table === "form_template_versions") {
          const insert = query.insert.bind(query);
          query.insert = (payload: Record<string, unknown>) => {
            const template = store.form_templates!.find((row) => row.id === payload.template_id);
            const message = template ? faults.failVersionInsertFor.get(String(template.key)) : undefined;
            if (message !== undefined && Number(payload.version) > 1) {
              return { select: () => ({ single: async () => ({ data: null, error: { message } }) }) };
            }
            return insert(payload);
          };
        }
        if (table === "form_template_current") {
          const upsert = (query as unknown as { upsert: (...args: unknown[]) => unknown }).upsert.bind(query);
          (query as unknown as { upsert: (...args: unknown[]) => unknown }).upsert = (...args: unknown[]) => {
            const payload = args[0] as { template_id: unknown; version_id: unknown };
            const template = store.form_templates!.find((row) => row.id === payload.template_id);
            const target = store.form_template_versions.find((row) => row.id === payload.version_id);
            const message = template ? faults.failPointerFor.get(String(template.key)) : undefined;
            if (message !== undefined && Number(target?.version) > 1) {
              return { then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: { message } }) };
            }
            return upsert(...args);
          };
        }
        if (table === "form_template_versions") {
          const update = (query as unknown as { update: (...args: unknown[]) => unknown }).update.bind(query);
          (query as unknown as { update: (...args: unknown[]) => unknown }).update = (...args: unknown[]) => {
            const patch = args[0] as { status?: string };
            if (patch.status !== "archived") return update(...args);
            return {
              eq: (_column: string, id: unknown) => {
                const version = store.form_template_versions.find((row) => row.id === id);
                const template = store.form_templates!.find((row) => row.id === version?.template_id);
                const message = template ? faults.failArchiveFor.get(String(template.key)) : undefined;
                if (message !== undefined) {
                  return { then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: { message } }) };
                }
                return (update(...args) as { eq: (c: string, v: unknown) => unknown }).eq("id", id);
              },
            };
          };
        }
        if (table === "form_templates" && faults.failLibraryRead !== null) {
          const message = faults.failLibraryRead;
          const select = query.select.bind(query);
          query.select = (...args: unknown[]) => {
            // Only the sync's own read (no filters yet) is replaced.
            if (args[0] === "id, key, name, short_name, description, active") {
              return { then: (resolve: (value: unknown) => unknown) => resolve({ data: null, error: { message } }) };
            }
            return select(...args);
          };
        }
        return query;
      },
    };
  },
}));

// Authorization is the real `authorizeForms` over a stand-in provider that applies the real matrix.
vi.mock("@/lib/config/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/runtime")>()),
  isDemoMode: () => false,
}));
vi.mock("@/lib/auth/server", () => ({
  authorizeRequest: async (request: Request, permission: Parameters<typeof hasPermission>[2]) => {
    const role = request.headers.get("x-test-role") as Role | null;
    if (!role) throw new AuthError("unauthenticated", "Sign in to Ask Bubbles.");
    if (!hasPermission(DEFAULT_PERMISSION_MATRIX, role, permission)) {
      throw new AuthError("forbidden", "Your role cannot do this.");
    }
    return { identity: { subject: `user-${role}`, role, scope: null, verified: true } };
  },
}));
vi.mock("@/lib/auth/page", () => ({ requirePagePermission: async () => null }));
vi.mock("@/lib/api/respond", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/respond")>()),
  assertWithinRateLimit: () => {},
}));
vi.mock("@/features/forms/template-library", () => ({ TemplateLibrary: () => null }));
vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  supabaseSecretKeyConfigured: () => true,
}));

const { ensureTemplateLibrary } = await import("./repository");
const { TEMPLATE_SEEDS } = await import("./library");
const templatesRoute = await import("@/app/api/forms/templates/route");
const { default: FormTemplatesPage } = await import("@/app/(app)/forms/templates/page");
const { TemplateSyncReport } = await import("@/features/forms/template-sync-report");

const PRODUCTION = { VERCEL: "1", VERCEL_ENV: "production", NODE_ENV: "production" };
const PREVIEW = { VERCEL: "1", VERCEL_ENV: "preview", NODE_ENV: "production" };
const DEVELOPMENT = { NODE_ENV: "development" };

/** The eleven templates whose wording changed with the Salon -> Store release. */
const REISSUED = [
  "sdit-epp",
  "tsd-epp",
  "asd-sdit-epp",
  "fttc-epp",
  "dmit-epp-tsd",
  "dmit-epp-dmit",
  "resignation-exit",
  "prescreen-phone-interview",
  "tanning-consultant-interview",
  "management-interview-round-1",
  "management-interview-round-2",
];

/** A version as a database seeded BEFORE the release holds it: the same document, worded "Salon". */
const asSalon = <T,>(value: T): T =>
  JSON.parse(
    JSON.stringify(value)
      .replace(/\bStores\b/g, "Salons")
      .replace(/\bStore(?=[\s'’]|\\")/g, "Salon")
      .replace(/\bstores\b/g, "salons")
      .replace(/\bstore\b/g, "salon"),
  ) as T;

const versionsOf = (key: string) => {
  const template = store.form_templates!.find((row) => row.key === key)!;
  return store.form_template_versions.filter((row) => row.template_id === template.id);
};

/** Production as it stood after PR #43's merge: installed, the eleven still on their Salon revision. */
async function productionBeforeTheSync() {
  await ensureTemplateLibrary("system", PRODUCTION);
  for (const key of REISSUED) {
    const seed = TEMPLATE_SEEDS.find((entry) => entry.key === key)!;
    for (const row of versionsOf(key)) {
      row.seed_revision = seed.revision - 1;
      row.document = asSalon(seed.document);
      row.variants = asSalon(seed.variants);
    }
  }
  supabaseCalls.count = 0;
}

const snapshot = () =>
  JSON.stringify({
    templates: store.form_templates,
    versions: store.form_template_versions,
    current: store.form_template_current,
    assets: store.form_template_assets,
  });

const post = (role?: Role) =>
  templatesRoute.POST(
    new Request("https://app.test/api/forms/templates", {
      method: "POST",
      headers: role ? { "x-test-role": role } : {},
    }),
  );

let errorLog: ReturnType<typeof vi.spyOn>;
let infoLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  supabaseCalls.count = 0;
  faults.failVersionInsertFor.clear();
  faults.failPointerFor.clear();
  faults.failArchiveFor.clear();
  faults.failLibraryRead = null;
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  infoLog = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Every text node of a rendered element tree, descending into props.children and props.title. */
function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  const props = (node as { props?: Record<string, unknown> }).props ?? {};
  return [props.title, props.children].map(textOf).join(" ");
}

function findElements(node: unknown, type: unknown, out: { props: Record<string, unknown> }[] = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((child) => findElements(child, type, out));
    return out;
  }
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  if (element.type === type) out.push(element as { props: Record<string, unknown> });
  if (element.props) findElements(element.props.children, type, out);
  return out;
}

const loggedEvents = () =>
  [...errorLog.mock.calls, ...infoLog.mock.calls]
    .map((call) => String(call[0]))
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as Record<string, unknown>);

/* ---------------------------------------------------------- who and where --- */

describe("who may trigger the sync", () => {
  it.each(["employee", "assistant_manager", "location_manager"] as Role[])(
    "refuses a %s, with a 403, and touches nothing",
    async (role) => {
      await productionBeforeTheSync();
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("VERCEL_ENV", "production");
      const before = snapshot();

      const response = await post(role);

      expect(response.status).toBe(403);
      expect(snapshot()).toBe(before);
      expect(supabaseCalls.count).toBe(0);
    },
  );

  it("refuses a request with no identity, with a 401, and touches nothing", async () => {
    await productionBeforeTheSync();
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    const before = snapshot();

    const response = await post();

    expect(response.status).toBe(401);
    expect(snapshot()).toBe(before);
    expect(supabaseCalls.count).toBe(0);
  });

  it.each(["district_manager", "regional_manager", "admin"] as Role[])(
    "allows a %s on Production",
    async (role) => {
      await productionBeforeTheSync();
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("VERCEL_ENV", "production");

      const response = await post(role);

      expect(response.status).toBe(200);
      expect(((await response.json()) as { revised: string[] }).revised.length).toBe(REISSUED.length);
    },
  );
});

describe("where the sync may run", () => {
  it.each([
    ["a Preview", PREVIEW],
    ["development", DEVELOPMENT],
  ])("on %s it reads and writes nothing", async (_name, env) => {
    await productionBeforeTheSync();
    const before = snapshot();

    const result = await ensureTemplateLibrary("system", env);

    expect(result.skipped).toBeDefined();
    expect(result).toMatchObject({ created: [], revised: [], renamed: [], heldBack: [], failed: [] });
    expect(supabaseCalls.count).toBe(0);
    expect(snapshot()).toBe(before);
  });

  it("refuses the POST route on a Preview with a 409, even for an admin", async () => {
    await productionBeforeTheSync();
    const before = snapshot();
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");

    const response = await post("admin");

    expect(response.status).toBe(409);
    expect(snapshot()).toBe(before);
  });
});

/* -------------------------------------------------------------- the first run --- */

describe("a first run on Production", () => {
  it("publishes version 2 of exactly the eleven templates, archiving version 1", async () => {
    await productionBeforeTheSync();
    const previous = new Map(REISSUED.map((key) => [key, versionsOf(key)[0]!.id]));

    const result = await ensureTemplateLibrary("admin-1", PRODUCTION);

    expect([...result.revised].sort()).toEqual([...REISSUED].sort());
    expect(result.failed).toEqual([]);
    expect(result.heldBack).toEqual([]);
    for (const key of REISSUED) {
      const seed = TEMPLATE_SEEDS.find((entry) => entry.key === key)!;
      const versions = versionsOf(key);
      expect(versions.map((row) => `${row.version}:${row.status}`).sort(), key).toEqual(["1:archived", "2:published"]);
      expect(versions.find((row) => row.version === 2)).toMatchObject({
        document: seed.document,
        seed_revision: seed.revision,
        published_by: "admin-1",
      });
      expect(versions.find((row) => row.id === previous.get(key))?.status, key).toBe("archived");
    }
    // The other templates keep their single version.
    for (const seed of TEMPLATE_SEEDS.filter((entry) => !REISSUED.includes(entry.key))) {
      expect(versionsOf(seed.key), seed.key).toHaveLength(1);
    }
  });

  it("does not create duplicate versions on a second or third run", async () => {
    await productionBeforeTheSync();
    await ensureTemplateLibrary("system", PRODUCTION);
    const afterFirst = snapshot();

    const second = await ensureTemplateLibrary("system", PRODUCTION);
    const third = await ensureTemplateLibrary("system", PRODUCTION);

    for (const result of [second, third]) {
      expect(result).toMatchObject({ created: [], revised: [], renamed: [], heldBack: [], failed: [] });
    }
    expect(snapshot()).toBe(afterFirst);
    for (const key of REISSUED) expect(versionsOf(key), key).toHaveLength(2);
  });

  it("leaves an administrator's authored version and an open draft alone, and says so", async () => {
    await productionBeforeTheSync();
    const authored = store.form_templates!.find((row) => row.key === "fttc-epp")!;
    store.form_template_versions.push({
      id: "authored-fttc",
      template_id: authored.id,
      version: 2,
      status: "published",
      document: { paper: "letter", blocks: [] },
      variants: [],
      seed_revision: 0,
      notes: "Authored here.",
      created_by: "dana",
    });
    const drafted = store.form_templates!.find((row) => row.key === "tsd-epp")!;
    store.form_template_versions.push({
      id: "draft-tsd",
      template_id: drafted.id,
      version: 2,
      status: "draft",
      document: { paper: "letter", blocks: [] },
      variants: [],
      seed_revision: 1,
      notes: "A draft.",
      created_by: "dana",
    });

    const result = await ensureTemplateLibrary("system", PRODUCTION);

    expect(result.heldBack.map((entry) => entry.key).sort()).toEqual(["fttc-epp", "tsd-epp"]);
    expect(result.revised).not.toContain("fttc-epp");
    expect(result.revised).not.toContain("tsd-epp");
    expect(result.failed).toEqual([]);
    expect(store.form_template_versions.find((row) => row.id === "authored-fttc")?.document).toEqual({
      paper: "letter",
      blocks: [],
    });
    expect(store.form_template_versions.find((row) => row.id === "draft-tsd")?.status).toBe("draft");
  });
});

/* --------------------------------------------------------- partial failures --- */

describe("a partial failure", () => {
  it("is reported accurately, does not stop the other templates, and is logged once, redacted", async () => {
    await productionBeforeTheSync();
    faults.failVersionInsertFor.set(
      "fttc-epp",
      "duplicate key value violates unique constraint; token sb_secret_ABCDEF0123456789abcdef and Bearer abcdefghijklmnop.",
    );

    const result = await ensureTemplateLibrary("system", PRODUCTION);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.key).toBe("fttc-epp");
    expect(result.failed[0]!.reason).toContain("duplicate key value");
    expect(result.failed[0]!.reason).not.toMatch(/sb_secret_|Bearer abcdefghijklmnop/);
    expect([...result.revised].sort()).toEqual(REISSUED.filter((key) => key !== "fttc-epp").sort());

    // The failed template is exactly as it was: version 1, still published and current.
    expect(versionsOf("fttc-epp").map((row) => `${row.version}:${row.status}`)).toEqual(["1:published"]);

    const events = loggedEvents();
    const failures = events.filter((event) => event.event === "forms.template_sync.failed");
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ level: "error", key: "fttc-epp", step: "install_or_revise" });
    const summary = events.find((event) => event.event === "forms.template_sync.completed")!;
    expect(summary).toMatchObject({ level: "error", failed: ["fttc-epp"] });
    expect((summary.revised as string[]).length).toBe(REISSUED.length - 1);
    // Nothing secret reached any log line.
    expect(JSON.stringify(errorLog.mock.calls)).not.toMatch(/sb_secret_|Bearer abcdefghijklmnop/);
  });

  it("heals on the next run: only the template that failed is published, nothing is duplicated", async () => {
    await productionBeforeTheSync();
    faults.failVersionInsertFor.set("fttc-epp", "temporary outage");
    await ensureTemplateLibrary("system", PRODUCTION);
    faults.failVersionInsertFor.clear();

    const retry = await ensureTemplateLibrary("system", PRODUCTION);

    expect(retry.revised).toEqual(["fttc-epp"]);
    expect(retry.failed).toEqual([]);
    for (const key of REISSUED) expect(versionsOf(key), key).toHaveLength(2);
  });

  it("is a 207 from the POST route, with the failure in the body", async () => {
    await productionBeforeTheSync();
    faults.failVersionInsertFor.set("fttc-epp", "temporary outage");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");

    const response = await post("admin");

    expect(response.status).toBe(207);
    const body = (await response.json()) as { revised: string[]; failed: { key: string }[] };
    expect(body.failed.map((entry) => entry.key)).toEqual(["fttc-epp"]);
    expect(body.revised).toHaveLength(REISSUED.length - 1);
  });

  it("logs nothing for a run that changed nothing", async () => {
    await ensureTemplateLibrary("system", PRODUCTION);
    errorLog.mockClear();
    infoLog.mockClear();

    await ensureTemplateLibrary("system", PRODUCTION);

    expect(errorLog).not.toHaveBeenCalled();
    expect(infoLog).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------ what the admin sees --- */

describe("what the administrator sees on Forms → Form Templates", () => {
  it("shows what a run revised, held back and failed", async () => {
    await productionBeforeTheSync();
    faults.failVersionInsertFor.set("fttc-epp", "temporary outage");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");

    const page = await FormTemplatesPage();

    const [report] = findElements(page, TemplateSyncReport);
    expect(report).toBeDefined();
    const text = textOf(TemplateSyncReport(report!.props as never));
    expect(text).toMatch(/Template library sync/);
    expect(text).toMatch(/10 revised/);
    expect(text).toMatch(/1 failed/);
    expect(text).toMatch(/fttc-epp.*temporary outage/);
  });

  it("says when a template is held back, and why", () => {
    const text = textOf(
      TemplateSyncReport({
        result: {
          created: [],
          existing: ["coaching"],
          revised: [],
          renamed: [],
          heldBack: [{ key: "tsd-epp", reason: "A draft (version 2) is open." }],
          failed: [],
        },
      }),
    );
    expect(text).toMatch(/1 held back/);
    expect(text).toMatch(/tsd-epp\s+held back:\s+A draft \(version 2\) is open/);
  });

  it("says nothing for a run a Preview skipped (its own notice covers that)", () => {
    expect(
      TemplateSyncReport({
        result: { created: [], existing: [], revised: [], renamed: [], heldBack: [], failed: [], skipped: { environment: "preview", reason: "off" } },
      }),
    ).toBeNull();
  });

  it("shows, redacts and logs a failure to read the library at all", async () => {
    faults.failLibraryRead = "connection refused sb_secret_ABCDEF0123456789abcdef";
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");

    const page = await FormTemplatesPage();

    const text = textOf(page);
    expect(text).toMatch(/The template library could not be read/);
    expect(text).toMatch(/connection refused/);
    expect(text).not.toMatch(/sb_secret_/);
    const logged = loggedEvents().find((event) => event.event === "forms.template_sync.page_failed");
    expect(logged).toMatchObject({ level: "error" });
    expect(JSON.stringify(errorLog.mock.calls)).not.toMatch(/sb_secret_/);
  });
});

/* ------------------------------------- an interrupted publish can always finish --- */

/**
 * The publish is three writes, not a transaction: insert the new version, point
 * `form_template_current` at it, archive the old one. A failure between them
 * must neither be reported as success, nor strand the template, nor let a retry
 * duplicate a version, lose the current one or override an administrator.
 */
describe("a publish interrupted between its steps", () => {
  const currentOf = (key: string) => {
    const template = store.form_templates!.find((row) => row.key === key)!;
    const pointer = store.form_template_current!.find((row) => row.template_id === template.id)!;
    return store.form_template_versions.find((row) => row.id === pointer.version_id)!;
  };
  const statuses = (key: string) =>
    versionsOf(key)
      .map((row) => `${row.version}:${row.status}`)
      .sort();

  it("stored but not made current: reported as failed, the old version stays current, and a retry completes it", async () => {
    await productionBeforeTheSync();
    faults.failPointerFor.set("fttc-epp", "pointer write refused");

    const first = await ensureTemplateLibrary("system", PRODUCTION);

    expect(first.failed.map((entry) => entry.key)).toEqual(["fttc-epp"]);
    expect(first.failed[0]!.reason).toMatch(/stored but could not be made current/);
    expect(first.failed[0]!.reason).toMatch(/previous version is still current/);
    expect(first.revised).not.toContain("fttc-epp");
    // Forms are still filled from version 1; the stored version 2 is waiting beside it.
    expect(currentOf("fttc-epp").version).toBe(1);
    expect(statuses("fttc-epp")).toEqual(["1:published", "2:published"]);

    faults.failPointerFor.clear();
    const retry = await ensureTemplateLibrary("system", PRODUCTION);

    expect(retry.failed).toEqual([]);
    expect(retry.revised).toEqual(["fttc-epp"]);
    expect(retry.repaired).toEqual(["fttc-epp"]);
    expect(currentOf("fttc-epp").version).toBe(2);
    // No duplicate was created, and the old version is archived, not deleted.
    expect(statuses("fttc-epp")).toEqual(["1:archived", "2:published"]);

    const again = await ensureTemplateLibrary("system", PRODUCTION);
    expect(again).toMatchObject({ revised: [], failed: [] });
    expect(again.repaired).toBeUndefined();
    expect(statuses("fttc-epp")).toEqual(["1:archived", "2:published"]);
  });

  it("current but the old version not archived: reported as failed (not a success), the new version stays current, a retry archives the leftover", async () => {
    await productionBeforeTheSync();
    faults.failArchiveFor.set("fttc-epp", "archive refused");

    const first = await ensureTemplateLibrary("system", PRODUCTION);

    expect(first.failed.map((entry) => entry.key)).toEqual(["fttc-epp"]);
    expect(first.failed[0]!.reason).toMatch(/is published and current, but the previous version could not be archived/);
    expect(first.revised).not.toContain("fttc-epp");
    expect(currentOf("fttc-epp").version).toBe(2);
    expect(statuses("fttc-epp")).toEqual(["1:published", "2:published"]);

    faults.failArchiveFor.clear();
    const retry = await ensureTemplateLibrary("system", PRODUCTION);

    expect(retry.failed).toEqual([]);
    expect(retry.repaired).toEqual(["fttc-epp"]);
    // Nothing new is published, and the current version is not lost or moved.
    expect(retry.revised).not.toContain("fttc-epp");
    expect(currentOf("fttc-epp").version).toBe(2);
    expect(statuses("fttc-epp")).toEqual(["1:archived", "2:published"]);
  });

  it("a retry that fails again leaves the same state and reports it again", async () => {
    await productionBeforeTheSync();
    faults.failPointerFor.set("fttc-epp", "still refused");
    await ensureTemplateLibrary("system", PRODUCTION);
    const stuck = snapshot();

    const second = await ensureTemplateLibrary("system", PRODUCTION);

    expect(second.failed.map((entry) => entry.key)).toEqual(["fttc-epp"]);
    expect(second.failed[0]!.reason).toMatch(/could not be made current/);
    expect(snapshot()).toBe(stuck);
  });

  it("an installed template whose version was stored but never pointed at is completed, without a second version", async () => {
    await productionBeforeTheSync();
    const template = store.form_templates!.find((row) => row.key === "demotion")!;
    store.form_template_current = store.form_template_current!.filter((row) => row.template_id !== template.id);

    const result = await ensureTemplateLibrary("system", PRODUCTION);

    expect(result.failed).toEqual([]);
    expect(result.repaired).toEqual(["demotion"]);
    expect(versionsOf("demotion")).toHaveLength(1);
    expect(currentOf("demotion").version).toBe(1);
  });

  it("does not override an administrator: after an interruption, an authored current version is left as it is", async () => {
    await productionBeforeTheSync();
    faults.failPointerFor.set("fttc-epp", "pointer write refused");
    await ensureTemplateLibrary("system", PRODUCTION);
    faults.failPointerFor.clear();
    // An administrator publishes their own version 3 in the meantime: it becomes current and archives version 1.
    const template = store.form_templates!.find((row) => row.key === "fttc-epp")!;
    store.form_template_versions.push({
      id: "authored-v3",
      template_id: template.id,
      version: 3,
      status: "published",
      document: { paper: "letter", blocks: [] },
      variants: [],
      seed_revision: 0,
      notes: "Authored here.",
      created_by: "dana",
      published_by: "dana",
    });
    store.form_template_current!.find((row) => row.template_id === template.id)!.version_id = "authored-v3";
    versionsOf("fttc-epp").find((row) => row.version === 1)!.status = "archived";

    const retry = await ensureTemplateLibrary("system", PRODUCTION);

    expect(retry.failed).toEqual([]);
    expect(retry.repaired).toBeUndefined();
    expect(currentOf("fttc-epp").id).toBe("authored-v3");
    // The stored seed version is left exactly as it was.
    expect(versionsOf("fttc-epp").find((row) => row.version === 2)?.status).toBe("published");
  });

  it("does not move the current version under an open draft", async () => {
    await productionBeforeTheSync();
    faults.failPointerFor.set("fttc-epp", "pointer write refused");
    await ensureTemplateLibrary("system", PRODUCTION);
    faults.failPointerFor.clear();
    const template = store.form_templates!.find((row) => row.key === "fttc-epp")!;
    store.form_template_versions.push({
      id: "draft-v3",
      template_id: template.id,
      version: 3,
      status: "draft",
      document: { paper: "letter", blocks: [] },
      variants: [],
      seed_revision: 1,
      notes: "A draft.",
      created_by: "dana",
    });

    const retry = await ensureTemplateLibrary("system", PRODUCTION);

    expect(retry.repaired).toBeUndefined();
    expect(currentOf("fttc-epp").version).toBe(1);
    expect(versionsOf("fttc-epp").find((row) => row.id === "draft-v3")?.status).toBe("draft");
  });

  it("leaves a form already filed on the old version pinned to it, with its document unchanged", async () => {
    await productionBeforeTheSync();
    const template = store.form_templates!.find((row) => row.key === "fttc-epp")!;
    const v1 = versionsOf("fttc-epp")[0]!;
    const documentBefore = JSON.stringify(v1.document);
    store.form_instances.push({ id: "filed-1", template_id: template.id, template_version_id: v1.id, status: "finalized" });
    faults.failPointerFor.set("fttc-epp", "pointer write refused");
    await ensureTemplateLibrary("system", PRODUCTION);
    faults.failPointerFor.clear();

    await ensureTemplateLibrary("system", PRODUCTION);

    expect(store.form_instances.find((row) => row.id === "filed-1")?.template_version_id).toBe(v1.id);
    expect(JSON.stringify(store.form_template_versions.find((row) => row.id === v1.id)!.document)).toBe(documentBefore);
    expect(store.form_template_versions.find((row) => row.id === v1.id)?.status).toBe("archived");
  });

  it("is not repaired from a Preview: nothing is read or written", async () => {
    await productionBeforeTheSync();
    faults.failPointerFor.set("fttc-epp", "pointer write refused");
    await ensureTemplateLibrary("system", PRODUCTION);
    faults.failPointerFor.clear();
    const stuck = snapshot();
    supabaseCalls.count = 0;

    const result = await ensureTemplateLibrary("system", PREVIEW);

    expect(result.skipped).toBeDefined();
    expect(supabaseCalls.count).toBe(0);
    expect(snapshot()).toBe(stuck);
  });

  it("is shown to the administrator, and logged", async () => {
    await productionBeforeTheSync();
    faults.failPointerFor.set("fttc-epp", "pointer write refused");
    await ensureTemplateLibrary("system", PRODUCTION);
    faults.failPointerFor.clear();
    errorLog.mockClear();
    infoLog.mockClear();

    const retry = await ensureTemplateLibrary("system", PRODUCTION);

    expect(loggedEvents().find((event) => event.event === "forms.template_sync.completed")).toMatchObject({
      repaired: ["fttc-epp"],
    });
    expect(textOf(TemplateSyncReport({ result: retry }))).toMatch(/Completed after an earlier run was interrupted:\s+fttc-epp/);
  });
});
