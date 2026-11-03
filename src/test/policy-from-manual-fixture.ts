import manual151 from "@/test/fixtures/jba-manual-production-151.json";
import { manualChunkFromRow, type ManualChunkRow } from "@/lib/knowledge/full-manual-load";
import { manualSectionHeadings, type ManualChunk } from "@/lib/forms/official-policy-manual";

import { retrievedChunks, type RetrievedChunk } from "@/lib/ai/policy-from-manual/chunks";

/** Test helper: the production JBA Policy Manual (151 rows), and a retrieved subset of it. */

export const WHOLE_MANUAL: ManualChunk[] = (manual151.chunks as ManualChunkRow[]).map((row) => {
  const chunk = manualChunkFromRow(row);
  return { ...chunk, page: chunk.page ?? null, locator: chunk.locator ?? undefined };
});

/** Attendance (41), Late Opening (42), Employee Parking (55), Lost and Found (56). */
export const RETRIEVED_INDEXES = [41, 42, 55, 56];

export function retrievedSubset(): RetrievedChunk[] {
  return retrievedChunks(WHOLE_MANUAL.filter((chunk) => RETRIEVED_INDEXES.includes(chunk.chunkIndex)));
}

export const MANUAL_VOCABULARY: string[] = manualSectionHeadings(WHOLE_MANUAL);
