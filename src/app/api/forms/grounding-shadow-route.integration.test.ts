import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";

/**
 * ============================================================================
 * SHADOW MODE CANNOT CHANGE DRAFTING
 * ============================================================================
 *
 * Runs the real draft route over the real knowledge provider (PGlite) holding
 * the shipped Framework text (`framework-chunks.json`, a read-only snapshot),
 * once with FORMS_GROUNDING_MODE unset and once with it set to "shadow", for
 * every document family. The prompt the model receives and the response the
 * manager gets must be byte-identical; the only difference allowed is the
 * count-only diagnostic log line, which must carry no employee-sensitive text.
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
  return {
    ...actual,
    loadScopedRoster: async () => actual.scopeRoster([], null),
    loadScopedRosterResult: async () => ({ status: "not_checked", reason: "no_scope" }),
  };
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
const framework = (await import("@/test/fixtures/framework-chunks.json")).default.chunks as {
  chunk_index: number;
  locator: string;
  content: string;
}[];

async function installFramework() {
  await database.db.query(
    `insert into public.knowledge_documents (id, knowledge_scope_id, title, tags, original_filename, mime_type, file_type, storage_path, size_bytes, source, status, indexed, indexed_at, version)
     values ($1, $2, 'ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT', '{performance-management-framework}', 'ASK_BUBBLES_PERFORMANCE_MANAGEMENT_FRAMEWORK_KB_TEXT.txt', 'text/plain', 'txt', 'snapshot/framework.txt', 100, 'upload', 'indexed', true, now(), 1)`,
    [FRAMEWORK_ID, ACTIVE_BRAND.knowledgeScopeId],
  );
  for (const chunk of framework) {
    await database.db.query(
      `insert into public.knowledge_chunks (document_id, knowledge_scope_id, chunk_index, version, content, locator, section, embedding_model, embedding)
       values ($1, $2, $3, 1, $4, $5, $5, 'bag-of-words-test', $6)`,
      [FRAMEWORK_ID, ACTIVE_BRAND.knowledgeScopeId, chunk.chunk_index, chunk.content, chunk.locator, `[${bagOfWordsEmbedding(chunk.locator, EMBEDDING_DIMENSIONS).join(",")}]`],
    );
  }
}

const NAME = "Jordan Testperson";
const NOTES = `${NAME} was 20 minutes late; she mentioned a private family medical matter.`;

/** Governed families reach the diagnostic; the others must behave exactly as before. */
const FAMILIES = [
  "dpoa", "policy-review", "follow-up-coaching", "sdit-epp", "tsd-epp", "asd-sdit-epp", "fttc-epp",
  "dmit-epp-tsd", "dmit-epp-dmit", "coaching", "demotion", "position-transfer", "resignation-exit",
  "prescreen-phone-interview", "management-interview-round-1",
];
const GOVERNED = new Set(["dpoa", "policy-review", "follow-up-coaching", "sdit-epp", "tsd-epp", "asd-sdit-epp", "fttc-epp", "dmit-epp-tsd", "dmit-epp-dmit"]);

async function draft(key: string, mode: string | undefined) {
  if (mode === undefined) delete process.env.FORMS_GROUNDING_MODE;
  else process.env.FORMS_GROUNDING_MODE = mode;
  const seed = MIGRATED_TEMPLATE_SEEDS.find((entry) => entry.key === key)!;
  const instance = await createInstance({ templateKey: key, variantKey: seed.variants[0]?.key ?? null, employeeName: NAME, createdBy: "qa-admin" } as never);
  for (const row of forms.form_instances) {
    const template = forms.form_templates!.find((entry) => entry.id === row.template_id);
    Object.assign(row, { template_key: template?.key, template_name: template?.name, layout_family: template?.layout_family, form_date: row.form_date ?? "2026-10-08" });
  }
  state.systems = [];
  const logs: string[] = [];
  const spy = vi.spyOn(console, "info").mockImplementation((line: unknown) => void logs.push(String(line)));
  try {
    const response = await draftRoute.POST(
      new Request(`https://app.test/api/forms/instances/${instance.id}/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ notes: NOTES }) }),
      { params: Promise.resolve({ id: instance.id }) },
    );
    return { status: response.status, body: JSON.stringify(await response.json()), systems: [...state.systems], logs };
  } finally {
    spy.mockRestore();
    delete process.env.FORMS_GROUNDING_MODE;
  }
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
  for (const key of Object.keys(forms) as (keyof FormsKey)[]) forms[key] = [];
  await database.db.query("delete from public.knowledge_chunks");
  await database.db.query("delete from public.knowledge_documents");
  await ensureTemplateLibrary("system");
});

type FormsKey = FakeStore;

describe("shadow mode, with the Framework installed", () => {
  it.each(FAMILIES)("%s: prompt and response are byte-identical to off", async (key) => {
    await installFramework();
    const off = await draft(key, undefined);
    const shadow = await draft(key, "shadow");
    const enforce = await draft(key, "enforce"); // not a mode in this build: behaves as shadow
    expect(shadow.status).toBe(off.status);
    expect(shadow.body).toBe(off.body);
    expect(shadow.systems).toEqual(off.systems);
    expect(enforce.systems).toEqual(off.systems);
    expect(enforce.body).toBe(off.body);
    expect(off.logs.filter((line) => line.includes("forms.grounding"))).toEqual([]);
    const lines = shadow.logs.filter((line) => line.includes("forms.grounding.shadow"));
    expect(lines.length).toBe(GOVERNED.has(key) ? 1 : 0);
  });

  it("the diagnostic line holds counts only: no name, no manager notes, no Framework text", async () => {
    await installFramework();
    const { logs } = await draft("dpoa", "shadow");
    const line = logs.find((entry) => entry.includes("forms.grounding.shadow"))!;
    const event = JSON.parse(line);
    expect(event).toMatchObject({ event: "forms.grounding.shadow", mode: "shadow", templateKey: "dpoa" });
    for (const secret of [NAME, "Jordan", "family medical", "20 minutes late", ...framework.slice(0, 20).map((chunk) => chunk.content.slice(0, 40))]) {
      expect(line).not.toContain(secret);
    }
    expect(event.labels.methodology).toBeGreaterThan(0);
  });
});

describe("shadow mode keeps the fail-closed safeguards", () => {
  it.each([...GOVERNED])("%s without the Framework: same blank form and notice, no model call, no diagnostic", async (key) => {
    const off = await draft(key, undefined);
    const shadow = await draft(key, "shadow");
    expect(shadow.body).toBe(off.body);
    expect(shadow.body).toContain(PM_DRAFT_UNAVAILABLE_NOTICE.slice(0, 40));
    expect(shadow.systems).toEqual([]);
    expect(shadow.logs.filter((line) => line.includes("forms.grounding"))).toEqual([]);
  });
});
