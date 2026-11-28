import "server-only";

import { MULTI_BRAND_MANUAL_TITLES, POLICY_MANUAL_BRAND_SCOPE } from "@/config/company/knowledge";
import { getSupabaseAdmin } from "@/lib/supabase/server";

import { isMultiBrandManual, isOtherBrandLabel, readManualForBrand } from "./brand-sections";

/**
 * ============================================================================
 * RETRIEVED MANUAL ROWS, AS THIS COMPANY READS THEM (K1 and K2, 28 Nov 2026)
 * ============================================================================
 *
 * Port from the sibling app (K1/K2, owner's review, 28 Nov 2026): there, seven
 * answers in six weeks quoted another brand's lines of the shared JBA Policy
 * Manual, because similarity retrieval handed the model whole chunks. Here the
 * vector match already reads the manual by brand (`providers/supabase.ts`,
 * which fails closed), but hybrid, recall and its heading scan did not, and the
 * agent loop's search_knowledge held the rule only in its rules book. They pass
 * their rows through here, so another brand's sections, labelled blocks and
 * bullets never reach an answer on any retriever. Kept text is verbatim; a row
 * with nothing left is dropped. Any other document passes through untouched.
 *
 * THE READING NEEDS THE WHOLE DOCUMENT IN ORDER: a brand block can open at the
 * end of one chunk and continue into the next. So the manual's chunks are read
 * once per document (and kept while the rows asked for are in it). A row whose
 * text is already part of its chunk's reading (an earlier retriever read it, or
 * a caller cut it from that) is kept as it is. A row whose document cannot be
 * read, or whose text is neither, is read ON ITS OWN, starting in the section
 * ingestion stored for it: never passed on unread.
 */

export interface BrandReadRow {
  readonly chunk_id: string;
  readonly document_id: string;
  readonly document_title: string;
  readonly section: string | null;
  readonly content: string;
}

/** Chunk id -> the stored chunk's text, and this company's reading of it. */
export type BrandReading = ReadonlyMap<string, { readonly original: string; readonly read: string }>;

/** A chunk of a manual, in document order, with the headings ingestion recorded for it. */
export interface BrandReadChunk {
  readonly id: string;
  readonly content: string;
  readonly headings: readonly string[];
}

/** The reading of a whole manual, chunk by chunk (chunks in document order). */
export function brandReadingOf(chunks: readonly BrandReadChunk[]): BrandReading {
  const read = readManualForBrand(
    chunks.map((chunk) => ({ content: chunk.content, headings: chunk.headings })),
    POLICY_MANUAL_BRAND_SCOPE,
  );
  return new Map(chunks.map((chunk, index) => [chunk.id, { original: chunk.content, read: read[index] ?? "" }]));
}

/** One row read on its own, from the section ingestion stored for it. */
export function readRowOnItsOwn(row: Pick<BrandReadRow, "content" | "section">): string {
  return (
    readManualForBrand(
      [{ content: row.content, headings: row.section ? [row.section] : [] }],
      POLICY_MANUAL_BRAND_SCOPE,
      { startsInSection: row.section },
    )[0] ?? ""
  );
}

export function isBrandReadDocument(title: string): boolean {
  return isMultiBrandManual(title, MULTI_BRAND_MANUAL_TITLES);
}

/**
 * `rows` with each multi-brand manual row's text replaced by this company's
 * reading, and rows with nothing left dropped. A row whose stored section is
 * another brand's label keeps no section. `loadReading` gives a manual's
 * reading by document id, or null when it cannot be read.
 */
export async function readRowsForBrand<R extends BrandReadRow>(
  rows: readonly R[],
  loadReading: (documentId: string, chunkIds: readonly string[]) => Promise<BrandReading | null> = loadDocumentReading,
): Promise<R[]> {
  const manuals = new Map<string, string[]>();
  for (const row of rows) {
    if (!isBrandReadDocument(row.document_title)) continue;
    const ids = manuals.get(row.document_id) ?? [];
    ids.push(row.chunk_id);
    manuals.set(row.document_id, ids);
  }
  if (manuals.size === 0) return [...rows];

  const readings = new Map<string, BrandReading | null>();
  for (const [documentId, chunkIds] of manuals) {
    readings.set(documentId, await loadReading(documentId, chunkIds).catch(() => null));
  }

  return rows.flatMap((row) => {
    if (!manuals.has(row.document_id)) return [row];
    const stored = readings.get(row.document_id)?.get(row.chunk_id);
    const text = !stored ? readRowOnItsOwn(row) : stored.original === row.content ? stored.read : alreadyRead(stored.read, row.content) ? row.content : readRowOnItsOwn(row);
    if (!text.trim()) return [];
    /* A section stored as another brand's label ("<Brand>") never labels what is kept (the paragraph after its list). */
    if (!row.section || !isOtherBrandLabel(row.section, POLICY_MANUAL_BRAND_SCOPE)) return [{ ...row, content: text }];
    const locator = (row as { locator?: unknown }).locator;
    return [{ ...row, content: text, section: null, ...(typeof locator === "string" ? { locator: locator.replace(/\s+—\s+.*$/, "") } : {}) }];
  });
}

/** A row's text that is part of the chunk's reading already (read by an earlier retriever, or cut from it): kept as it is. */
function alreadyRead(read: string, content: string): boolean {
  const flat = (text: string) => text.replace(/\s+/g, " ").trim();
  const wanted = flat(content);
  return wanted !== "" && flat(read).includes(wanted);
}

/* Per manual document: its reading, kept while the chunk ids asked for are in it (a new version has new chunks). */
const READINGS = new Map<string, BrandReading>();
const READINGS_LIMIT = 8;

function headingsOf(metadata: unknown): string[] {
  const sections = (metadata as { sections?: unknown } | null)?.sections;
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((entry) => {
    const heading = (entry as { heading?: unknown } | null)?.heading;
    return typeof heading === "string" && heading.trim() ? [heading.trim()] : [];
  });
}

/** A manual's reading from its current version's chunks; null when it cannot be read. */
export async function loadDocumentReading(documentId: string, chunkIds: readonly string[]): Promise<BrandReading | null> {
  const kept = READINGS.get(documentId);
  if (kept && chunkIds.every((id) => kept.has(id))) return kept;
  try {
    const client = getSupabaseAdmin();
    const { data: document, error: documentError } = await client
      .from("knowledge_documents")
      .select("title, version")
      .eq("id", documentId)
      .single();
    if (documentError || !document || typeof (document as { title?: unknown }).title !== "string") return null;
    const { data, error } = await client
      .from("knowledge_chunks")
      .select("id, chunk_index, content, section, metadata")
      .eq("document_id", documentId)
      .eq("version", (document as { version: unknown }).version)
      .order("chunk_index", { ascending: true });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const chunks = (data as { id: string; chunk_index: number; content: string; section: string | null; metadata: unknown }[])
      .slice()
      .sort((a, b) => a.chunk_index - b.chunk_index)
      .map((chunk) => ({
        id: chunk.id,
        content: chunk.content,
        headings: [...new Set([...(chunk.section ? [chunk.section] : []), ...headingsOf(chunk.metadata)])],
      }));
    const reading = brandReadingOf(chunks);
    if (READINGS.size >= READINGS_LIMIT) READINGS.clear();
    READINGS.set(documentId, reading);
    return reading;
  } catch {
    return null;
  }
}

/** Tests only: forget the kept readings. */
export function forgetBrandReadingsForTests(): void {
  READINGS.clear();
}
