import type { SourceCitation } from "@/types";

/**
 * A citation stays only when the current manual chunks contain its page,
 * and its heading when the citation names one. A chunk from an older
 * edition is not in this list, so it cannot keep a citation.
 */

export interface CurrentManualChunk {
  readonly documentId: string;
  readonly section: string | null;
  readonly page: number | null;
  readonly content: string;
}

function pageOf(locator: string): number | null {
  const match = /\b(?:page|p\.)\s*(\d+)/i.exec(locator);
  if (!match) return null;
  const page = Number(match[1]);
  return page > 0 ? page : null;
}

function headingOf(citation: SourceCitation): string | null {
  const locator = citation.locator.replace(/\bpage\s+\d+\s*[—–-]?\s*/i, "").trim();
  if (locator.length >= 4 && !/^page\s+\d+$/i.test(citation.locator.trim())) return locator;
  const line = citation.excerpt.split("\n").map((item) => item.trim()).find((item) => item.length >= 4) ?? "";
  return line.length >= 4 && line.length <= 80 ? line : null;
}

export function citationMatchesCurrentManual(citation: SourceCitation, chunks: readonly CurrentManualChunk[]): boolean {
  const page = pageOf(citation.locator);
  const heading = headingOf(citation);
  return chunks.some((chunk) => {
    if (chunk.documentId !== citation.documentId) return false;
    if (page !== null && chunk.page !== page) return false;
    if (!heading) return page !== null;
    const section = chunk.section?.trim().toLowerCase() ?? "";
    const wanted = heading.toLowerCase();
    if (section.length >= 4 && (section === wanted || section.includes(wanted) || wanted.includes(section))) return true;
    return chunk.content.toLowerCase().includes(wanted);
  });
}

export function keepVerifiedCitations(
  citations: readonly SourceCitation[],
  chunks: readonly CurrentManualChunk[],
): SourceCitation[] {
  return citations.filter((citation) => citationMatchesCurrentManual(citation, chunks));
}
