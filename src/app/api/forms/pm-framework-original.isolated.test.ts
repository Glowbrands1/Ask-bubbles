import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";

// A plain ES module script, used by the CLI and tested here.
import { prepareFramework, restoreAppName } from "../../../../scripts/knowledge/framework-debrand.mjs";

/**
 * ============================================================================
 * THE REAL FRAMEWORK: VERIFIED, PREPARED AND INSTALLED IN AN ISOLATED DATABASE
 * ============================================================================
 *
 * The owner approved Ask Sunny's current Performance Management Framework as
 * the source of truth, with only the app's name changed, and approved
 * installing the prepared copy in an ISOLATED test environment, tagged
 * `performance-management-framework`, before any production upload.
 *
 * This is that step. It needs the original file, which is internal and is not
 * in this repository, so it runs only when pointed at one:
 *
 *   PERFORMANCE_FRAMEWORK_ORIGINAL_PATH=/path/to/ASK_SUNNY_PERFORMANCE_MANAGEMENT_FRAMEWORK_KB_TEXT.txt \
 *   PERFORMANCE_FRAMEWORK_REPORT_OUT=/path/to/report.json \
 *     npx vitest run src/app/api/forms/pm-framework-original.isolated.test.ts
 *
 * 1. THE FILE IS THE ONE OF RECORD. Its bytes are compared with the reference
 *    platform's stored original (size and the storage object's MD5), and its
 *    text is re-chunked with this repository's extractor and chunker — the
 *    same code — to the content hash recorded when it was indexed there. Three
 *    independent checks; a reconstruction or an edited copy fails them.
 * 2. ONLY THE APP'S NAME CHANGES. Undoing those changes gives back the
 *    original, byte for byte.
 * 3. IT INSTALLS THROUGH THE REAL UPLOAD PIPELINE into a throwaway Postgres
 *    (PGlite, the repository's migrations), with the tag, and the app's own
 *    readiness check finds all twelve required groups.
 * 4. EVERY GOVERNED FORM DRAFTS WITH IT: each pinned framework section reaches
 *    the model for Corrective Action, Policy Review, Follow-Up Coaching and the
 *    six EPPs. The model is a recording stub; no production service is called.
 *
 * Nothing here touches a production database, storage bucket or model.
 */

/** The reference platform's stored original, read from its storage and knowledge records (8 Oct 2026). */
const ORIGINAL_OF_RECORD = {
  fileName: "ASK_SUNNY_PERFORMANCE_MANAGEMENT_FRAMEWORK_KB_TEXT.txt",
  sizeBytes: 81_579,
  /** The storage object's ETag: a single-part upload, so the MD5 of its bytes. */
  md5: "0a0428325876fa9e3aee731cca370e5e",
  /** `hashChunks` over the indexed chunks; the extractor and chunker here are the same code. */
  chunkHash: "038ea85c5a0f8768b6bf8d4e27851a20212ed160b59c3d7d20f435017b326c00",
  chunkCount: 88,
  characterCount: 77_088,
} as const;

const PREPARED_FILE_NAME = "ASK_BUBBLES_PERFORMANCE_MANAGEMENT_FRAMEWORK_KB_TEXT.txt";
const PREPARED_TITLE = "ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT";
const FRAMEWORK_TAG = "performance-management-framework";

const SOURCE = process.env.PERFORMANCE_FRAMEWORK_ORIGINAL_PATH ?? "";
const REPORT_OUT = process.env.PERFORMANCE_FRAMEWORK_REPORT_OUT ?? "";
const describeOriginal = SOURCE !== "" && existsSync(SOURCE) ? describe : describe.skip;

vi.setConfig({ hookTimeout: 180_000, testTimeout: 180_000 });

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
  knowledge: null as unknown as {
    from: (table: string) => unknown;
    rpc: (...args: unknown[]) => unknown;
    storage: unknown;
  } | null,
  prompts: [] as string[],
}));

/* Forms tables on the in-memory fake; knowledge tables, storage and RPCs on PGlite — one admin client. */
vi.mock("@/lib/supabase/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/server")>()),
  getSupabaseAdmin: () => {
    const fake = fakeSupabase(forms);
    return {
      from: (table: string) => (table.startsWith("knowledge_") ? state.knowledge!.from(table) : fake.from(table)),
      rpc: (...args: unknown[]) => state.knowledge!.rpc(...args),
      storage: state.knowledge!.storage,
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
        state.prompts.push(`${request.system}\n${request.messages.map((message) => message.content).join("\n")}`);
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
const { extractDocument } = await import("@/lib/ingestion/extract");
const { chunkSegments } = await import("@/lib/ingestion/chunking");
const { hashChunks, ingestDocument } = await import("@/lib/ingestion/pipeline");
const { checkFrameworkReadiness } = await import("@/lib/knowledge/framework-readiness");
const { SupabaseKnowledgeProvider } = await import("@/lib/knowledge/providers/supabase");
const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const { createInstance } = await import("@/lib/forms/instances");
const { MIGRATED_TEMPLATE_SEEDS } = await import("@/lib/forms/library");
const { PM_DRAFT_UNAVAILABLE_NOTICE } = await import("@/lib/forms/pm-governance");
const draftRoute = await import("./instances/[id]/draft/route");

/** The governed forms, each with notes a manager might give. */
const GOVERNED = [
  { key: "dpoa", label: "Corrective Action", notes: "Jordan Testperson was 20 minutes late today." },
  { key: "policy-review", label: "Policy Review", notes: "Review the dress code with Jordan Testperson." },
  { key: "follow-up-coaching", label: "Follow-Up Coaching", notes: "Follow-up with Jordan Testperson on punctuality: on time every shift since." },
  { key: "sdit-epp", label: "SDIT EPP", notes: "Plan for Jordan Testperson to improve guest engagement." },
  { key: "tsd-epp", label: "TSD EPP", notes: "Plan for Jordan Testperson to improve team scheduling." },
  { key: "asd-sdit-epp", label: "ASD-SDIT EPP", notes: "Plan for Jordan Testperson to prepare for leadership." },
  { key: "fttc-epp", label: "FTTC EPP", notes: "Plan for Jordan Testperson to improve guest engagement." },
  { key: "dmit-epp-tsd", label: "DMIT EPP (TSD review)", notes: "Review of Jordan Testperson's progress as TSD." },
  { key: "dmit-epp-dmit", label: "DMIT EPP (DMIT review)", notes: "Review of Jordan Testperson's progress as DMIT." },
] as const;

type Database = Awaited<ReturnType<typeof createKnowledgeTestDatabase>>;

describeOriginal("the reference platform's Performance Management Framework, prepared for Ask Bubbles", () => {
  let original: Buffer;
  let originalText: string;
  let prepared: ReturnType<typeof prepareFramework>;
  let database: Database;
  const report: Record<string, unknown> = {};

  beforeAll(async () => {
    original = readFileSync(SOURCE);
    originalText = original.toString("utf8");
    prepared = prepareFramework(originalText);

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
    await database?.close();
    if (REPORT_OUT) writeFileSync(REPORT_OUT, JSON.stringify(report, null, 1));
  });

  describe("1. the file is the original of record", () => {
    it("has the stored original's exact size and MD5", () => {
      const md5 = createHash("md5").update(original).digest("hex");
      const sha256 = createHash("sha256").update(original).digest("hex");
      Object.assign(report, { original: { sizeBytes: original.length, md5, sha256 } });
      expect(original.length).toBe(ORIGINAL_OF_RECORD.sizeBytes);
      expect(md5).toBe(ORIGINAL_OF_RECORD.md5);
    });

    it("re-chunks to the content hash recorded when it was indexed", async () => {
      const extracted = await extractDocument("txt", new Uint8Array(original));
      const chunks = chunkSegments(extracted.segments);
      const chunkHash = hashChunks(chunks);
      Object.assign(report, { originalChunks: { count: chunks.length, characterCount: extracted.characterCount, chunkHash } });
      expect(extracted.characterCount).toBe(ORIGINAL_OF_RECORD.characterCount);
      expect(chunks).toHaveLength(ORIGINAL_OF_RECORD.chunkCount);
      expect(chunkHash).toBe(ORIGINAL_OF_RECORD.chunkHash);
    });
  });

  describe("2. only the app's name changes", () => {
    it("leaves no app name, and undoing the changes gives back the original byte for byte", () => {
      Object.assign(report, {
        preparation: {
          appNameChanges: prepared.report.appNameChanges,
          byRule: prepared.report.byRule,
          changes: prepared.report.changes,
          flaggedForReview: prepared.report.flags.filter((flag: { count: number }) => flag.count > 0),
          sourceCompanyContexts: prepared.report.companyContexts,
        },
      });
      expect(prepared.report.appNameLeft).toBe(0);
      expect(prepared.report.targetNameInSource).toBe(0);
      expect(Buffer.from(restoreAppName(prepared.text), "utf8").equals(original)).toBe(true);
    });
  });

  describe("3. installed through the real upload pipeline, with the tag", () => {
    it("indexes, and the app's readiness check finds every required group", async () => {
      const result = await ingestDocument({
        file: new Blob([prepared.text], { type: "text/plain" }),
        fileName: PREPARED_FILE_NAME,
        mimeType: "text/plain",
        title: PREPARED_TITLE,
        category: "leadership_coaching",
        tags: [FRAMEWORK_TAG],
        scopeId: ACTIVE_BRAND.knowledgeScopeId,
        uploadedByName: "Isolated verification",
      });
      // The library shows an indexed document as "ready".
      expect(result.document.status).toBe("ready");

      const readiness = await checkFrameworkReadiness(PERFORMANCE_MANAGEMENT_FRAMEWORK, ACTIVE_BRAND.knowledgeScopeId);
      Object.assign(report, {
        installed: {
          chunkCount: result.chunkCount,
          ready: readiness.ready,
          matchedBy: readiness.matchedBy,
          presentGroups: readiness.presentGroups,
          missingGroups: readiness.missingGroups,
          mandatoryChunkCount: readiness.mandatoryChunkCount,
          problems: readiness.problems,
          advisories: readiness.advisories,
        },
      });
      expect(readiness.problems).toEqual([]);
      expect(readiness.ready).toBe(true);
      expect(readiness.matchedBy).toBe("tag");
      expect([...readiness.presentGroups].sort()).toEqual(PERFORMANCE_MANAGEMENT_FRAMEWORK.ruleGroups.map((group) => group.id).sort());
    });
  });

  describe("4. every governed form drafts with it", () => {
    const drafted: Record<string, unknown> = {};

    afterAll(() => {
      Object.assign(report, { drafting: drafted });
    });

    it.each(GOVERNED)("$label: drafted, with every pinned framework section given to the model", async ({ key, notes }) => {
      for (const table of Object.keys(forms) as (keyof FakeStore)[]) forms[table] = [];
      await ensureTemplateLibrary("system");

      const grounding = await new SupabaseKnowledgeProvider().fetchRoleGrounding(PERFORMANCE_MANAGEMENT_FRAMEWORK, ACTIVE_BRAND.knowledgeScopeId);
      if (!grounding.ok) throw new Error(`${grounding.failure.code}: ${grounding.failure.detail}`);

      const seed = MIGRATED_TEMPLATE_SEEDS.find((entry) => entry.key === key)!;
      const instance = await createInstance({ templateKey: key, variantKey: seed.variants[0]?.key ?? null, employeeName: "Jordan Testperson", createdBy: "qa-admin" } as never);
      for (const row of forms.form_instances) {
        const template = forms.form_templates!.find((entry) => entry.id === row.template_id);
        Object.assign(row, { template_key: template?.key, template_name: template?.name, layout_family: template?.layout_family, form_date: row.form_date ?? "2026-10-08" });
      }
      state.prompts = [];
      const response = await draftRoute.POST(
        new Request(`https://app.test/api/forms/instances/${instance.id}/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ notes }) }),
        { params: Promise.resolve({ id: instance.id }) },
      );
      const body = (await response.json()) as { notice?: string | null };
      const prompt = state.prompts.join("\n");
      const missing = grounding.grounding.rows.filter((row) => !prompt.includes(row.content.trim())).map((row) => row.locator);
      drafted[key] = { status: response.status, modelCalls: state.prompts.length, pinnedSections: grounding.grounding.rows.length, pinnedSectionsMissingFromPrompt: missing };

      expect(response.status).toBe(200);
      expect(body.notice ?? "").not.toContain(PM_DRAFT_UNAVAILABLE_NOTICE);
      expect(state.prompts.length).toBeGreaterThan(0);
      expect(missing).toEqual([]);
    });
  });
});
