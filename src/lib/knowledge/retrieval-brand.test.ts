import { beforeEach, describe, expect, it, vi } from "vitest";

import fixture from "@/test/fixtures/jba-manual-production-151.json";

/*
 * K1 port (owner's review, 28 Nov 2026): the vector match already read the shared JBA Policy Manual by brand; hybrid and
 * recall did not. Hybrid now hands the manual's rows on as this company reads them too. The manual is read whole from
 * its current version (a brand block can start in the chunk before). Production's manual rows.
 */
type Row = { chunk_index: number; content: string; section: string | null; page: number | null; locator: string; metadata?: unknown };
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
  similarity: 0.82,
  vector_rank: 1,
  keyword_rank: 1,
  section_exact: false,
});

const db = vi.hoisted(() => ({ rpcRows: [] as unknown[], hybridFails: false, reads: 0 }));

vi.mock("@/lib/supabase/server", () => {
  const table = (name: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      order: async () => {
        db.reads += 1;
        return name === "knowledge_chunks"
          ? { data: chunks.map((chunk) => ({ id: `c-${chunk.chunk_index}`, chunk_index: chunk.chunk_index, content: chunk.content, section: chunk.section, metadata: chunk.metadata })), error: null }
          : { data: null, error: { message: "no" } };
      },
      single: async () => ({ data: { title: TITLE, version: 1 }, error: null }),
    };
    return query;
  };
  return {
    getSupabaseAdmin: () => ({
      rpc: async (name: string) =>
        name === "match_knowledge_chunks_hybrid" && db.hybridFails ? { data: null, error: { message: "timeout" } } : { data: db.rpcRows, error: null },
      from: table,
    }),
  };
});

vi.mock("@/lib/embeddings", async () => {
  const { EMBEDDING_DIMENSIONS } = await import("@/lib/config/models");
  return { getEmbeddingProvider: () => ({ dimensions: EMBEDDING_DIMENSIONS, embedQuery: async () => [0.1, 0.2] }) };
});

import { forgetBrandReadingsForTests } from "./brand-rows";
import { matchHybridKnowledge } from "./hybrid-match";

const said = (rows: { content: string }[]) => rows.map((row) => row.content).join("\n");

describe("hybrid retrieval reads the shared manual as this company (K1 port)", () => {
  beforeEach(() => {
    forgetBrandReadingsForTests();
    db.rpcRows = [asRow(at(142)), asRow(at(141)), asRow(at(82))];
    db.reads = 0;
  });

  it("this company's holiday list stays; the other brands' lists and help lines go", async () => {
    const rows = await matchHybridKnowledge({ query: "what holidays are we closed", scopeId: "scope-bcs", limit: 8 });
    expect(said(rows)).toContain("Buff City Soap is closed on the below listed holidays.");
    expect(said(rows)).not.toMatch(/Crunch Fitness is closed|Sun Tan City is closed|888-622-6290|abcfinancial/);
  });

  it("the manual is read once and kept while the rows asked for are in it", async () => {
    await matchHybridKnowledge({ query: "holidays", scopeId: "scope-bcs", limit: 8 });
    await matchHybridKnowledge({ query: "holidays again", scopeId: "scope-bcs", limit: 8 });
    expect(db.reads).toBe(1);
  });
});
