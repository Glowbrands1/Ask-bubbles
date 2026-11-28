import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.RETRIEVAL_RECALL_ENABLED = "1";
});

import fixture from "@/test/fixtures/jba-manual-production-151.json";

/*
 * K2 port (owner's review, 28 Nov 2026): on the agent loop, "only this company's brand" was a rules-book line, so a
 * retrieved chunk of the shared JBA Policy Manual reached the model whole, other brands' holiday lists and help lines
 * included. search_knowledge now holds the rule in code: whatever the retriever returns, the manual's rows reach the
 * model as this company reads them, on every retriever (the vector match already did; hybrid and recall did not). The
 * manager's question is invented; the manual rows are production's.
 */
type Row = { chunk_index: number; content: string; section: string | null; page: number | null; locator: string; metadata?: { sections?: { heading: string; page: number }[] } | null };
const chunks = [...(fixture.chunks as Row[])].sort((a, b) => a.chunk_index - b.chunk_index);
const at = (index: number) => chunks.find((chunk) => chunk.chunk_index === index)!;
const TITLE = "JBA Policy Manual Edited 5.2025";
const asRow = (chunk: Row) => ({
  chunk_id: `c-${chunk.chunk_index}`,
  document_id: "doc-manual",
  document_title: TITLE,
  category: "policies_compliance",
  locator: chunk.locator,
  page: chunk.page,
  section: chunk.section,
  content: chunk.content,
  similarity: 0.8,
});

const retrieved = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("@/lib/knowledge/recall-match", () => ({ matchRecallKnowledge: async () => retrieved.rows }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => {
    throw new Error("offline");
  },
}));
vi.mock("@/lib/knowledge/providers/supabase", async () => {
  const data = (await import("@/test/fixtures/jba-manual-production-151.json")).default as { chunks: Row[] };
  return {
    SupabaseKnowledgeProvider: class {
      async officialPolicyManualVersion() {
        return { documentId: "doc-manual", version: "1" };
      }
      async fetchOfficialPolicyManual() {
        return {
          ok: true,
          documentId: "doc-manual",
          documentTitle: "JBA Policy Manual Edited 5.2025",
          documentCategory: "policies_compliance",
          matchedBy: "tag",
          chunks: data.chunks.map((chunk) => ({
            chunkIndex: chunk.chunk_index,
            chunkId: `c-${chunk.chunk_index}`,
            locator: chunk.locator,
            page: chunk.page,
            content: chunk.content,
            section: chunk.section,
            printedPage: null,
            sections: chunk.metadata?.sections ?? [],
          })),
        };
      }
      async fetchRoleGrounding() {
        return { ok: false, failure: { code: "role_document_query_failed", detail: "offline" } };
      }
    },
  };
});

import { forgetAgentLoopManualForTests, searchKnowledge, type ToolContext, type ToolEffects } from "./tools";

const context = { scopeId: "scope-bcs", question: "What holidays are we closed and do we get holiday pay?" } as unknown as ToolContext;
const texts = (result: unknown) => JSON.stringify((result as { results?: unknown[] }).results ?? []).replace(/\\n/g, "\n");

describe("search_knowledge reads the shared manual as this company (K2)", () => {
  beforeEach(() => forgetAgentLoopManualForTests());

  it("a holiday question never hands the model another brand's holiday list, even when the retriever returns it whole", async () => {
    retrieved.rows = [asRow(at(141)), asRow(at(142)), asRow(at(140))];
    const effects = { proposal: null, formUpdate: null } as unknown as ToolEffects;
    const result = await searchKnowledge(context, effects, { query: "holidays closed holiday pay" });
    const said = texts(result);
    expect(said).toContain("Buff City Soap is closed on the below listed holidays.");
    expect(said).toContain("The Corporate Office is closed on the below listed holidays.");
    expect(said).toContain("1.5 times their regular wage");
    expect(said).not.toMatch(/Crunch Fitness is closed|Sun Tan City is closed|salons will be open/);
  });

  it("a dress-code chunk that is all another brand's never reaches the model, nor becomes a source card", async () => {
    retrieved.rows = [asRow(at(48))];
    const effects = { proposal: null, formUpdate: null } as unknown as ToolEffects;
    const result = await searchKnowledge(context, effects, { query: "dress code shirts" });
    expect(texts(result)).not.toMatch(/Crunch|Two uniform shirts/);
    expect(effects.sources ?? []).toEqual([]);
  });

  it("an IT help question keeps this company's help line and never another brand's", async () => {
    retrieved.rows = [asRow(at(82))];
    const result = await searchKnowledge(context, { proposal: null, formUpdate: null } as unknown as ToolEffects, { query: "IT help desk phone" });
    expect(texts(result)).toContain("244-4848");
    expect(texts(result)).not.toMatch(/888-622-6290|abcfinancial/);
  });
});
