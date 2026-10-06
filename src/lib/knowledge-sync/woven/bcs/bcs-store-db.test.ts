import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMBEDDING_DIMENSIONS } from "@/lib/config/models";
import { __setEmbeddingProvider } from "@/lib/embeddings";
import { __setSupabaseAdmin } from "@/lib/supabase/server";
import { bagOfWordsEmbedding, createKnowledgeTestDatabase, type KnowledgeTestDatabase } from "@/test/pglite-knowledge-db";
import { audienceKey } from "../../access";
import { createSupabaseKnowledgeSink } from "../../sink";
import { createSupabaseKnowledgeSyncStore } from "../../store";
import { WovenTeamClient } from "../http";
import { createWovenKnowledgeConnector, runWovenKnowledgeSync } from "../sync";
import { BCS_COMPANY, BCS_COMPANY_ID, FakeBcsWoven, PASSWORD, USERNAME, noSleep } from "./test-support";

vi.setConfig({ hookTimeout: 60_000, testTimeout: 60_000 });

/**
 * The Buff City Soap sync on the REAL schema (the repository's migrations on
 * PGlite) through the real Supabase sync store and knowledge sink: the rows
 * Production will write — `communication` items, new reason codes, the dry-run
 * plan in the run report — satisfy every table constraint, and the dry run
 * writes no knowledge document.
 */

let database: KnowledgeTestDatabase;

beforeEach(async () => {
  database = await createKnowledgeTestDatabase();
  __setSupabaseAdmin(database.client);
  __setEmbeddingProvider({
    name: "bag of words (test)",
    model: "bag-of-words-test",
    dimensions: EMBEDDING_DIMENSIONS,
    configured: true,
    embedDocuments: async (texts) => texts.map((text) => bagOfWordsEmbedding(text, EMBEDDING_DIMENSIONS)),
    embedQuery: async (text) => bagOfWordsEmbedding(text, EMBEDDING_DIMENSIONS),
  });
});

afterEach(async () => {
  __setSupabaseAdmin(null);
  __setEmbeddingProvider(null);
  await database.close();
});

const q = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await database.db.query<T>(sql, params)).rows;

describe("Buff City Soap sync, in the database", () => {
  it("dry run, decision, initial sync: every row fits the schema, and only shareable procedure text is indexed", async () => {
    const fake = new FakeBcsWoven();
    const store = createSupabaseKnowledgeSyncStore(database.client);
    const config = {
      enabled: true,
      baseUrl: "https://app.woven.team",
      company: BCS_COMPANY,
      companyId: BCS_COMPANY_ID,
      tenantProblem: null,
      downloads: { fileLibrary: false, handbook: false },
      credentials: { username: USERNAME, password: PASSWORD },
      missingCredentials: [],
      problems: [],
      previewTestModeAllowed: false,
    };
    let clock = new Date("2026-10-06T12:00:00Z");
    const run = async (mode: "preview" | "sync") => {
      const outcome = await runWovenKnowledgeSync(
        { mode, trigger: "manual", requestedBy: "admin:test" },
        {
          config,
          store,
          sink: createSupabaseKnowledgeSink("woven"),
          connector: createWovenKnowledgeConnector(config, new WovenTeamClient({ baseUrl: config.baseUrl, fetch: fake.fetch, sleep: noSleep, transport: { minIntervalMs: 0, baseBackoffMs: 0 } })),
          now: () => clock,
        },
      );
      clock = new Date(clock.getTime() + 86_400_000);
      return outcome;
    };

    expect((await run("preview")).status).toBe("succeeded");
    expect(await q("select id from public.knowledge_documents")).toEqual([]);
    expect(await q("select id from public.knowledge_sync_items")).toEqual([]);
    const inventory = await q<{ content_type: string; reason: string | null }>("select content_type, reason from public.knowledge_sync_preview_items");
    expect(inventory.filter((r) => r.content_type === "communication").map((r) => r.reason).sort()).toEqual(["draft", "published_not_visible"]);
    const [runRow] = await q<{ report: { plan?: { flaggedOwnership: unknown[] } } }>("select report from public.knowledge_sync_runs where mode = 'preview'");
    expect(runRow!.report.plan!.flaggedOwnership).toHaveLength(3);
    expect(JSON.stringify(inventory) + JSON.stringify(runRow)).not.toContain(PASSWORD);

    await store.saveDecision({ source: "woven", audienceKey: audienceKey(["All Positions"]), decision: "company_wide", decidedBy: "admin:test", decidedAt: clock.toISOString() });
    expect((await run("sync")).status).toMatch(/^succeeded/);

    const docs = await q<{ title: string; status: string }>("select title, status::text as status from public.knowledge_documents order by title");
    expect(docs).toEqual([
      { title: "Fire Extinguisher Use", status: "indexed" },
      { title: "Opening the Makery", status: "indexed" },
    ]);
    const states = await q<{ content_type: string; state: string; reason: string | null }>("select content_type, state, reason from public.knowledge_sync_items");
    expect(states.filter((s) => s.content_type === "communication")).toHaveLength(2);
    expect(states.find((s) => s.reason === "ownership_review")).toMatchObject({ content_type: "handbook", state: "NEEDS_REVIEW" });
  });
});
