import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";

/**
 * ============================================================================
 * DRAFTING THE GOVERNED FORMS NEEDS THE FRAMEWORK — AND WORKS WITH IT
 * ============================================================================
 *
 * Corrective Action, Policy Review, Follow-Up Coaching and the EPPs are drafted
 * only when the Performance Management Framework resolves; without it they
 * fail closed with a blank, editable form. This runs the draft route against
 * the REAL knowledge provider over a real Postgres (PGlite, the repository's
 * own knowledge migrations) holding a framework document, and against the
 * same database without one.
 *
 * THE FRAMEWORK HERE IS SYNTHETIC: one chunk per required group, under the
 * group's own heading, with placeholder text. It proves the wiring — identity
 * by tag, the twelve groups, the pinning into the drafting prompt — without
 * putting the internal document in this repository. The real document is
 * validated with `PERFORMANCE_FRAMEWORK_PATH` (see
 * `performance-management-role.test.ts`).
 */

vi.setConfig({ hookTimeout: 120_000, testTimeout: 120_000 });

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

const forms: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
};

const state = vi.hoisted(() => ({
  knowledge: null as unknown as { from: (table: string) => unknown; rpc: (...args: unknown[]) => unknown } | null,
  systems: [] as string[],
}));

/* Forms tables on the in-memory fake; knowledge tables on PGlite — one admin client, routed by table. */
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => {
    const fake = fakeSupabase(forms);
    return {
      from: (table: string) => (table.startsWith("knowledge_") ? state.knowledge!.from(table) : fake.from(table)),
      rpc: (...args: unknown[]) => state.knowledge!.rpc(...args),
      storage: (fake as { storage?: unknown }).storage,
    };
  },
  __setSupabaseAdmin: () => {},
}));

vi.mock("@/lib/api/respond", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/respond")>()),
  assertLiveMode: () => {},
  assertNoConfigurationProblems: () => {},
  assertWithinRateLimit: () => {},
}));

vi.mock("@/lib/auth/server", () => ({
  authorizeRequest: async (_request: Request, permission: string) => ({
    identity: { subject: "qa-admin", email: "qa-admin@example.com", displayName: "QA Admin", role: "admin", scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] }, verified: true },
    permission,
    provider: "supabase",
  }),
}));

vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: async (request: { system: string; messages: { content: string }[]; tool_choice: { name: string } }) => {
        // Everything the model was given: the system rules and the drafting message.
        state.systems.push(`${request.system}\n${request.messages.map((message) => message.content).join("\n")}`);
        return { stop_reason: "tool_use", content: [{ type: "tool_use", name: request.tool_choice.name, input: { values: {}, checked: {} } }] };
      },
    },
  }),
}));

vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return { ...actual, loadScopedRoster: async () => actual.scopeRoster([], null) };
});

const { EMBEDDING_DIMENSIONS } = await import("@/lib/config/models");
const { __setEmbeddingProvider } = await import("@/lib/embeddings");
const { bagOfWordsEmbedding, createKnowledgeTestDatabase } = await import("@/test/pglite-knowledge-db");
const { PERFORMANCE_MANAGEMENT_FRAMEWORK } = await import("@/config/company/knowledge");
const { ACTIVE_BRAND } = await import("@/lib/brand");
const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const { createInstance } = await import("@/lib/forms/instances");
const { MIGRATED_TEMPLATE_SEEDS } = await import("@/lib/forms/library");
const { PM_DRAFT_UNAVAILABLE_NOTICE } = await import("@/lib/forms/pm-governance");
const draftRoute = await import("./instances/[id]/draft/route");

type Database = Awaited<ReturnType<typeof createKnowledgeTestDatabase>>;
let database: Database;

const FRAMEWORK_ID = "0f0f0f0f-0000-4000-8000-00000000f001";
const MARKER = "Synthetic framework text for";

/** One distinct heading per required group (groups share alternatives, so this is a matching). */
const FRAMEWORK_HEADINGS: string[] = (() => {
  const groups = PERFORMANCE_MANAGEMENT_FRAMEWORK.ruleGroups;
  const chosen: string[] = [];
  const assign = (index: number): boolean => {
    if (index === groups.length) return true;
    for (const heading of groups[index]!.headings) {
      if (chosen.includes(heading)) continue;
      chosen[index] = heading;
      if (assign(index + 1)) return true;
    }
    chosen.length = index;
    return false;
  };
  if (!assign(0)) throw new Error("the required groups cannot each have a heading of their own");
  return chosen;
})();

async function installFramework() {
  await database.db.query(
    `insert into public.knowledge_documents (id, knowledge_scope_id, title, tags, original_filename, mime_type, file_type, storage_path, size_bytes, source, status, indexed, indexed_at, version)
     values ($1, $2, 'ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT', '{performance-management-framework}', 'ASK_BUBBLES_PERFORMANCE_MANAGEMENT_FRAMEWORK_KB_TEXT.txt', 'text/plain', 'txt', 'synthetic/framework.txt', 100, 'upload', 'indexed', true, now(), 1)`,
    [FRAMEWORK_ID, ACTIVE_BRAND.knowledgeScopeId],
  );
  for (const [index, heading] of FRAMEWORK_HEADINGS.entries()) {
    await database.db.query(
      `insert into public.knowledge_chunks (document_id, knowledge_scope_id, chunk_index, version, content, locator, section, embedding_model, embedding)
       values ($1, $2, $3, 1, $4, $5, $5, 'bag-of-words-test', $6)`,
      [FRAMEWORK_ID, ACTIVE_BRAND.knowledgeScopeId, index, `${MARKER} "${heading}".`, heading, `[${bagOfWordsEmbedding(heading, EMBEDDING_DIMENSIONS).join(",")}]`],
    );
  }
}

/** The governed forms, each with notes a manager might give. */
const GOVERNED = [
  { key: "dpoa", notes: "Jordan Testperson was 20 minutes late today." },
  { key: "policy-review", notes: "Review the dress code with Jordan Testperson." },
  { key: "follow-up-coaching", notes: "Follow-up with Jordan Testperson on punctuality: she has been on time every shift since." },
  { key: "sdit-epp", notes: "Plan for Jordan Testperson to improve client engagement." },
  { key: "tsd-epp", notes: "Plan for Jordan Testperson to improve team scheduling." },
  { key: "asd-sdit-epp", notes: "Plan for Jordan Testperson to prepare for leadership." },
  { key: "fttc-epp", notes: "Plan for Jordan Testperson to improve client engagement." },
  { key: "dmit-epp-tsd", notes: "Review of Jordan Testperson's progress as TSD." },
  { key: "dmit-epp-dmit", notes: "Review of Jordan Testperson's progress as DMIT." },
] as const;

async function draft(key: string, notes: string) {
  const seed = MIGRATED_TEMPLATE_SEEDS.find((entry) => entry.key === key)!;
  const instance = await createInstance({ templateKey: key, variantKey: seed.variants[0]?.key ?? null, employeeName: "Jordan Testperson", createdBy: "qa-admin" } as never);
  for (const row of forms.form_instances) {
    const template = forms.form_templates!.find((entry) => entry.id === row.template_id);
    Object.assign(row, { template_key: template?.key, template_name: template?.name, layout_family: template?.layout_family, form_date: row.form_date ?? "2026-10-08" });
  }
  state.systems = [];
  const response = await draftRoute.POST(
    new Request(`https://app.test/api/forms/instances/${instance.id}/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ notes }) }),
    { params: Promise.resolve({ id: instance.id }) },
  );
  return { status: response.status, body: (await response.json()) as { notice?: string | null }, systems: [...state.systems] };
}

beforeAll(async () => {
  database = await createKnowledgeTestDatabase();
  state.knowledge = database.client as never;
  __setEmbeddingProvider({
    name: "bag of words (test)",
    model: "bag-of-words-test",
    dimensions: EMBEDDING_DIMENSIONS,
    configured: true,
    embedDocuments: async (texts: string[]) => texts.map((text) => bagOfWordsEmbedding(text, EMBEDDING_DIMENSIONS)),
    embedQuery: async (text: string) => bagOfWordsEmbedding(text, EMBEDDING_DIMENSIONS),
  } as never);
});

afterAll(async () => {
  __setEmbeddingProvider(null);
  await database.close();
});

beforeEach(async () => {
  for (const key of Object.keys(forms) as (keyof FakeStore)[]) forms[key] = [];
  await database.db.query("delete from public.knowledge_chunks");
  await database.db.query("delete from public.knowledge_documents");
  await ensureTemplateLibrary("system");
});

describe("without the framework in the knowledge base", () => {
  it.each(GOVERNED)("$key fails closed: no AI draft, the blank form stays editable", async ({ key, notes }) => {
    const { status, body, systems } = await draft(key, notes);
    expect(status).toBe(200);
    expect(body.notice).toBe(PM_DRAFT_UNAVAILABLE_NOTICE);
    expect(systems).toEqual([]);
  });
});

describe("with the framework installed, identified by its tag", () => {
  it.each(GOVERNED)("$key is drafted, with every required group of the framework given to the model", async ({ key, notes }) => {
    await installFramework();
    const { status, body, systems } = await draft(key, notes);
    expect(status).toBe(200);
    expect(body.notice ?? "").not.toContain(PM_DRAFT_UNAVAILABLE_NOTICE);
    expect(systems.length).toBeGreaterThan(0);
    const prompt = systems.join("\n");
    for (const [index, group] of PERFORMANCE_MANAGEMENT_FRAMEWORK.ruleGroups.entries()) {
      expect(prompt, group.id).toContain(`${MARKER} "${FRAMEWORK_HEADINGS[index]}"`);
    }
  });

  it("the plain Coaching Form is not governed and drafts either way", async () => {
    const { body, systems } = await draft("coaching", "Coach Jordan Testperson on greeting guests.");
    expect(body.notice ?? "").not.toContain(PM_DRAFT_UNAVAILABLE_NOTICE);
    expect(systems.length).toBeGreaterThan(0);
  });
});
