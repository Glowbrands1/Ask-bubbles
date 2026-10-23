import type { ManualChunk } from "@/lib/forms/official-policy-manual";
import { bestHeading, type RankedHeading } from "@/lib/knowledge/section-rank";

import { formatJbaCitation } from "./jba-citation";

/**
 * The manual section a turn is about, chosen from the sections that were
 * retrieved. The page is the chunk's own printed page. A heading with no
 * passage is cited by name and page only when the chunk carries a page.
 * Nothing here maps a topic word to a section.
 */

export interface CitedSection {
  readonly section: string;
  readonly page: number | null;
}

function headingsOf(chunks: readonly ManualChunk[]): string[] {
  const found: string[] = [];
  for (const chunk of chunks) {
    if (chunk.section) found.push(chunk.section);
    for (const section of chunk.sections ?? []) found.push(section.heading);
  }
  return found;
}

export function citedSections(turns: readonly string[], chunks: readonly ManualChunk[]): CitedSection[] {
  const headings = headingsOf(chunks);
  if (headings.length === 0) return [];
  const text = turns.filter((turn) => turn.trim() !== "").join("\n");
  const best = bestHeading(text, headings);
  if (!best) return [];
  return [{ section: best.heading, page: pageFor(best, chunks) }];
}

function pageFor(best: RankedHeading, chunks: readonly ManualChunk[]): number | null {
  const key = best.heading.toLowerCase();
  for (const chunk of chunks) {
    const listed = chunk.sections?.find((section) => section.heading.toLowerCase() === key);
    if (listed && listed.page > 0) return listed.page;
    if ((chunk.section ?? "").toLowerCase() === key) {
      if (typeof chunk.printedPage === "number" && chunk.printedPage > 0) return chunk.printedPage;
      if (typeof chunk.page === "number" && chunk.page > 0) return chunk.page;
    }
  }
  return null;
}

function passage(section: CitedSection, chunks: readonly ManualChunk[]): string {
  const heading = formatJbaCitation(section.section, section.page);
  const key = section.section.toLowerCase();
  const chunk =
    chunks.find((item) => (item.section ?? "").toLowerCase() === key) ??
    chunks.find((item) => item.content.toLowerCase().includes(key)) ??
    null;
  if (!chunk) return heading;
  return `${heading}\n${chunk.content.trim().slice(0, 500)}`;
}

/** Append the retrieved section. Off, or with nothing confident, the text is unchanged. */
export function withMappedPolicy(
  content: string,
  turns: readonly string[],
  chunks: readonly ManualChunk[],
  enabled: boolean,
): string {
  if (!enabled) return content;
  const sections = citedSections(turns, chunks).filter(
    (section) => !content.toLowerCase().includes(formatJbaCitation(section.section, section.page).toLowerCase()),
  );
  if (sections.length === 0) return content;
  const block = sections.map((section) => passage(section, chunks)).join("\n\n");
  return `${content.trim()}\n\n**Policy cited from the JBA Policy Manual**\n\n${block}`;
}
