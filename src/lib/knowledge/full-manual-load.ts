import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

import { MULTI_BRAND_MANUAL_TITLES } from "@/config/company/knowledge";
import { isMultiBrandManual } from "@/lib/knowledge/brand-sections";
import {
  isPolicyQuestion,
  planFullManualContext,
  type FullManualDocument,
  type FullManualPlan,
} from "@/lib/ai/full-manual-context";

/**
 * Current JBA Policy Manual documents for the full-manual prompt.
 *
 * `status = indexed` and `indexed = true` is the same gate retrieval uses.
 * A retired or superseded row is not indexed, and `isCurrentManual` drops
 * one if it is passed in anyway. Chunks are the document's current version,
 * in chunk_index order.
 */

function readPrintedPage(metadata: Record<string, unknown> | null): number | null {
  const value = metadata?.printedPage;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function readHeadings(metadata: Record<string, unknown> | null, section: string | null): string[] {
  const value = metadata?.sections;
  const fromSections = Array.isArray(value)
    ? value.flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) return [];
        const heading = (entry as { heading?: unknown }).heading;
        return typeof heading === "string" && heading.trim() ? [heading.trim()] : [];
      })
    : [];
  if (section && section.trim() && !fromSections.some((heading) => heading.toLowerCase() === section.trim().toLowerCase())) {
    return [section.trim(), ...fromSections];
  }
  return fromSections;
}

async function fetchIndexedManuals(scopeId: string): Promise<FullManualDocument[]> {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("knowledge_documents")
    .select("id, title, category, status, indexed, version")
    .eq("knowledge_scope_id", scopeId)
    .eq("indexed", true)
    .eq("status", "indexed");
  if (error) throw new Error(error.message);

  const documents: FullManualDocument[] = [];
  for (const row of (data ?? []) as {
    id: string;
    title: string;
    category: string | null;
    status: string;
    indexed: boolean;
    version: number;
  }[]) {
    if (!isMultiBrandManual(row.title, MULTI_BRAND_MANUAL_TITLES)) continue;
    const { data: chunks, error: chunkError } = await client
      .from("knowledge_chunks")
      .select("chunk_index, locator, page, section, content, metadata")
      .eq("document_id", row.id)
      .eq("version", row.version)
      .order("chunk_index", { ascending: true });
    if (chunkError) throw new Error(chunkError.message);
    documents.push({
      id: row.id,
      title: row.title,
      category: row.category,
      status: row.status,
      indexed: row.indexed,
      chunks: ((chunks ?? []) as {
        chunk_index: number;
        locator: string | null;
        page: number | null;
        section: string | null;
        content: string;
        metadata: Record<string, unknown> | null;
      }[]).map((chunk) => ({
        chunkIndex: chunk.chunk_index,
        content: chunk.content,
        locator: chunk.locator,
        page: chunk.page,
        printedPage: readPrintedPage(chunk.metadata),
        section: chunk.section,
        headings: readHeadings(chunk.metadata, chunk.section),
      })),
    });
  }
  return documents;
}

/** Null is not used. A failed read is an empty plan so retrieval can stand. */
export async function loadFullManualPlan(scopeId: string, question: string, policyText?: string): Promise<FullManualPlan> {
  const asked = policyText ?? question;
  if (!isPolicyQuestion(asked)) {
    return planFullManualContext({ question, policyText: asked, documents: [] });
  }
  try {
    const documents = await fetchIndexedManuals(scopeId);
    return planFullManualContext({ question, policyText: asked, documents });
  } catch {
    return planFullManualContext({ question, policyText: asked, documents: [] });
  }
}
