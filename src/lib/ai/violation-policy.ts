import type { ManualChunk } from "@/lib/forms/official-policy-manual";

import { accountManualSections } from "./account-manual-sections";
import { formatManualCitation } from "./policy-citation-fields";

/**
 * The manual section a turn is about, from the same readers a Corrective
 * Action uses. The page is the chunk's own printed page. Nothing here
 * prefers one heading over another by overlap.
 */

export interface CitedSection {
  readonly section: string;
  readonly page: number | null;
}

export function citedSections(turns: readonly string[], chunks: readonly ManualChunk[]): CitedSection[] {
  const text = turns.filter((turn) => turn.trim() !== "").join("\n");
  return accountManualSections(text, chunks).map((section) => ({
    section: section.heading,
    page: section.page > 0 ? section.page : null,
  }));
}

function passage(section: CitedSection, chunks: readonly ManualChunk[]): string {
  const heading = formatManualCitation(section.section, section.page);
  const key = section.section.toLowerCase();
  const chunk =
    chunks.find((item) => (item.section ?? "").toLowerCase() === key) ??
    chunks.find((item) => item.content.toLowerCase().includes(key)) ??
    null;
  if (!chunk) return heading;
  return `${heading}\n${chunk.content.trim().slice(0, 500)}`;
}

/** Append the retrieved section. Off, or with nothing resolved, the text is unchanged. */
export function withMappedPolicy(
  content: string,
  turns: readonly string[],
  chunks: readonly ManualChunk[],
  enabled: boolean,
): string {
  if (!enabled) return content;
  const sections = citedSections(turns, chunks).filter(
    (section) => !content.toLowerCase().includes(formatManualCitation(section.section, section.page).toLowerCase()),
  );
  if (sections.length === 0) return content;
  const block = sections.map((section) => passage(section, chunks)).join("\n\n");
  return `${content.trim()}\n\n**Policy cited from the JBA Policy Manual**\n\n${block}`;
}
