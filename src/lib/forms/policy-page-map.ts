import type { ManualChunk } from "@/lib/forms/official-policy-manual";

/**
 * Printed page for a manual heading, from the chunks in hand.
 *
 * The key is the heading the manual already uses. A word that does not name
 * a heading is not in the map. The page is the chunk's printed page.
 */

export function policyPrintedPages(chunks: readonly ManualChunk[]): ReadonlyMap<string, number> {
  const pages = new Map<string, number>();
  for (const chunk of chunks) {
    const printed =
      typeof chunk.printedPage === "number" && chunk.printedPage > 0 ? chunk.printedPage : null;
    const headings = [
      chunk.section,
      ...(chunk.sections ?? []).map((section) => section.heading),
    ].filter((heading): heading is string => Boolean(heading && heading.trim()));
    for (const heading of headings) {
      const fromSection = chunk.sections?.find((section) => section.heading === heading)?.page;
      const page = printed ?? (typeof fromSection === "number" && fromSection > 0 ? fromSection : null);
      const key = heading.trim().toLowerCase();
      if (page && page > 0 && !pages.has(key)) pages.set(key, page);
    }
  }
  return pages;
}

export function printedPageForHeading(heading: string, chunks: readonly ManualChunk[]): number | null {
  return policyPrintedPages(chunks).get(heading.trim().toLowerCase()) ?? null;
}
