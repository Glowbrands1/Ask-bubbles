import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

import { MULTI_BRAND_MANUAL_TITLES } from "@/config/company/knowledge";
import { isMultiBrandManual } from "@/lib/knowledge/brand-sections";
import {
  asksAboutManual,
  isPolicyQuestion,
  planFullManualContext,
  planManualCitations,
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

function readSections(metadata: Record<string, unknown> | null): { heading: string; page: number }[] {
  const value = metadata?.sections;
  if (!Array.isArray(value)) return [];
  const sections: { heading: string; page: number }[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const heading = (entry as { heading?: unknown }).heading;
    const page = (entry as { page?: unknown }).page;
    if (typeof heading !== "string" || !heading.trim()) continue;
    if (typeof page !== "number" || !Number.isInteger(page) || page <= 0) continue;
    sections.push({ heading: heading.trim(), page });
  }
  return sections;
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

/** The knowledge_chunks columns this loader selects. */
export interface ManualChunkRow {
  chunk_index: number;
  locator: string | null;
  page: number | null;
  section: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
}

/** One stored chunk row as the full-manual prompt reads it. Tests replay production rows through this. */
export function manualChunkFromRow(chunk: ManualChunkRow): FullManualDocument["chunks"][number] {
  return {
    chunkIndex: chunk.chunk_index,
    content: chunk.content,
    locator: chunk.locator,
    page: chunk.page,
    printedPage: readPrintedPage(chunk.metadata),
    section: chunk.section,
    headings: readHeadings(chunk.metadata, chunk.section),
    sections: readSections(chunk.metadata),
  };
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
      chunks: ((chunks ?? []) as ManualChunkRow[]).map(manualChunkFromRow),
    });
  }
  return documents;
}

/**
 * Null is not used. A failed read is an empty plan so retrieval can stand.
 *
 * `wideGate` (FULL_MANUAL_WIDE_GATE_ENABLED): a question the policy words do
 * not catch still gets the manual when retrieval's best excerpt is from the
 * manual, or when it names a word of a section heading the manual prints
 * (see `asksAboutManual`). The manual is read to decide; a question it does
 * not cover keeps retrieval, and its plan carries the passages so a reply's
 * manual sources can still be cited on their printed pages.
 */
export async function loadFullManualPlan(
  scopeId: string,
  question: string,
  policyText?: string,
  options: { readonly wideGate?: boolean; readonly topRowIsManual?: boolean } = {},
): Promise<FullManualPlan> {
  const asked = policyText ?? question;
  const policy = isPolicyQuestion(asked);
  if (!policy && !options.wideGate) {
    return planFullManualContext({ question, policyText: asked, documents: [] });
  }
  try {
    const documents = await fetchIndexedManuals(scopeId);
    if (policy) return planFullManualContext({ question, policyText: asked, documents });
    const cites = planManualCitations(documents);
    if (options.topRowIsManual || asksAboutManual(question, cites)) {
      return planFullManualContext({ question, policyText: asked, documents, asked: true });
    }
    return { ...planFullManualContext({ question, policyText: asked, documents: [] }), ...cites };
  } catch {
    return planFullManualContext({ question, policyText: asked, documents: [] });
  }
}

/**
 * The current manuals' passages for citing a reply answered from retrieval.
 * Null when they cannot be read; the reply's sources then stay as they were.
 */
export async function loadManualCitationPlan(
  scopeId: string,
): Promise<Pick<FullManualPlan, "index" | "passages"> | null> {
  try {
    const cites = planManualCitations(await fetchIndexedManuals(scopeId));
    return cites.passages.length > 0 ? cites : null;
  } catch {
    return null;
  }
}
