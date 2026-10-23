import "server-only";

import { applyRerank } from "@/lib/ai/retrieval-rerank";
import { callClaudeTool } from "@/lib/ai/call-claude";
import { CLAUDE_HAIKU_MODEL, EMBEDDING_DIMENSIONS, RETRIEVAL } from "@/lib/config/models";
import { getEmbeddingProvider } from "@/lib/embeddings";
import { getSupabaseAdmin } from "@/lib/supabase/server";

import type { MatchedChunkRow } from "./mappers";
import { selectRecallCandidates, type RecallCandidate } from "./recall-rank";

/**
 * Keyword + vector candidates with no similarity floor, fuzzy headings, and
 * a Haiku pick. Called only when RETRIEVAL_RECALL_ENABLED is on.
 *
 * A Haiku failure keeps the fused order, including every section the
 * question named by overlap with the heading.
 */

interface HybridRpcRow extends MatchedChunkRow {
  vector_rank: number | null;
  keyword_rank: number | null;
  section_exact: boolean | null;
}

interface FuzzyRpcRow extends MatchedChunkRow {
  section_similarity: number | null;
}

function toRecall(row: HybridRpcRow, sectionSimilarity: number | null): RecallCandidate {
  return {
    row: {
      chunk_id: row.chunk_id,
      document_id: row.document_id,
      document_title: row.document_title,
      category: row.category,
      locator: row.locator,
      page: row.page,
      section: row.section,
      content: row.content,
      similarity: Number(row.similarity),
    },
    vectorRank: row.vector_rank === null || row.vector_rank === undefined ? null : Number(row.vector_rank),
    keywordRank: row.keyword_rank === null || row.keyword_rank === undefined ? null : Number(row.keyword_rank),
    sectionExact: Boolean(row.section_exact),
    sectionSimilarity,
  };
}

function asIdList(input: unknown): string[] | null {
  if (!input || typeof input !== "object" || !("ids" in input)) return null;
  const ids = (input as { ids?: unknown }).ids;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) return null;
  return ids;
}

async function fuzzyRows(query: string, scopeId: string, limit: number): Promise<FuzzyRpcRow[]> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc("match_knowledge_sections_fuzzy", {
      query_text: query,
      scope_id: scopeId,
      match_count: Math.min(50, Math.max(limit, 8)),
      min_similarity: 0.3,
    });
    if (error) return [];
    return (data ?? []) as FuzzyRpcRow[];
  } catch {
    return [];
  }
}

async function pickIds(query: string, rows: readonly MatchedChunkRow[]): Promise<string[] | null> {
  try {
    const listed = rows.map((row) => `${row.chunk_id}\t${row.section ?? ""}\t${row.document_title}`).join("\n");
    const raw = await callClaudeTool({
      model: CLAUDE_HAIKU_MODEL,
      maxTokens: 300,
      system:
        "Pick the passages that answer the question. Return their ids in the order they should be read. Return an empty ids list when none of them answer it.",
      tool: {
        name: "pick_passages",
        description: "The passage ids to keep, in reading order.",
        input_schema: {
          type: "object",
          additionalProperties: false,
          required: ["ids"],
          properties: { ids: { type: "array", items: { type: "string" } } },
        },
      },
      messages: [{ role: "user", content: `Question:\n${query}\n\nPassages:\n${listed}` }],
    });
    return asIdList(raw);
  } catch {
    return null;
  }
}

export async function matchRecallKnowledge(input: {
  readonly query: string;
  readonly scopeId: string;
  readonly limit?: number;
}): Promise<MatchedChunkRow[]> {
  const limit = input.limit ?? RETRIEVAL.topK;
  const query = input.query.trim();
  if (!query) return [];

  const embeddings = getEmbeddingProvider();
  if (embeddings.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error("The configured embedding model does not match the database vector width.");
  }
  const queryEmbedding = await embeddings.embedQuery(query);
  const { data, error } = await getSupabaseAdmin().rpc("match_knowledge_chunks_hybrid", {
    query_embedding: queryEmbedding,
    query_text: query,
    scope_id: input.scopeId,
    match_count: Math.min(50, Math.max(limit, 20)),
    min_similarity: 0,
    filter_categories: null,
  });
  if (error) throw new Error(`Knowledge retrieval failed: ${error.message}`);

  const fuzzy = await fuzzyRows(query, input.scopeId, limit);
  const similarityById = new Map(fuzzy.map((row) => [row.chunk_id, Number(row.section_similarity)]));
  const hybrid = ((data ?? []) as HybridRpcRow[]).map((row) => toRecall(row, similarityById.get(row.chunk_id) ?? null));
  const seen = new Set(hybrid.map((candidate) => candidate.row.chunk_id));
  for (const row of fuzzy) {
    if (seen.has(row.chunk_id)) continue;
    hybrid.push(
      toRecall({ ...row, similarity: 0, vector_rank: null, keyword_rank: null, section_exact: false }, Number(row.section_similarity)),
    );
  }

  const selected = selectRecallCandidates(hybrid, query, { limit });
  const picked = await pickIds(query, selected.rows);
  return applyRerank(selected.rows, picked, selected.pinnedIds);
}
