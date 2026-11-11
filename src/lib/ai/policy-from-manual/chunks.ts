import { manualSectionHeadings, type ManualChunk } from "@/lib/forms/official-policy-manual";

/**
 * ============================================================================
 * THE MANUAL CHUNKS A POLICY CITATION MAY REST ON (POLICY_CITATION_CHECK_ENABLED)
 * ============================================================================
 *
 * Every quote and every "<Heading>, JBA Policy Manual p.N" label in a reply is
 * checked against these, and only these: the chunks that were retrieved for
 * the turn (or the whole manual, when the whole manual was sent). A chunk the
 * model never saw cannot back a citation.
 *
 * The id is the row's chunkId when the reader supplied one, else
 * `idx-<chunkIndex>`, so a manual read without ids (tests, the eval) still
 * names its chunks the same way every time.
 *
 * The headings are the manual's own (`manualSectionHeadings`: the headings
 * printed on the chunk's sheet, never the contents page), in its own spelling.
 * Nothing imports this module yet.
 */

export interface RetrievedChunk {
  readonly id: string;
  readonly chunkIndex: number;
  /** The headings this chunk prints, as the manual spells them. */
  readonly headings: readonly string[];
  /** The page the manual prints for this chunk (the PDF sheet only where it prints none). */
  readonly page: number | null;
  readonly text: string;
  /** The chunk as read, for `findManualSection`. */
  readonly source: ManualChunk;
}

export function chunkIdOf(chunk: ManualChunk): string {
  return chunk.chunkId && chunk.chunkId.trim() !== "" ? chunk.chunkId : `idx-${chunk.chunkIndex}`;
}

export function retrievedChunks(manual: readonly ManualChunk[]): RetrievedChunk[] {
  return [...manual]
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((chunk) => ({
      id: chunkIdOf(chunk),
      chunkIndex: chunk.chunkIndex,
      headings: manualSectionHeadings([chunk]),
      page: chunk.printedPage ?? chunk.page ?? null,
      text: chunk.content,
      source: chunk,
    }));
}
