"use client";

import Link from "next/link";

import { citationChipsEnabled } from "@/lib/config/chat-ui-flags";
import type { SourceCitation } from "@/types";

/** "Standards of Conduct, page 12" → the section and the page, when both are there. */
export function citationChipLabel(citation: SourceCitation): string {
  const locator = citation.locator.replace(/\s+/g, " ").trim();
  const page = /\b(?:page|p\.)\s*(\d+)/i.exec(locator);
  const heading = locator.replace(/\b(?:page|p\.)\s*\d+\s*[—–-]?\s*/i, "").replace(/[,–—-]\s*$/, "").trim();
  const section = heading.length >= 4 ? heading : citation.documentTitle;
  if (page) return `${section} · p. ${page[1]}`;
  return section || citation.documentTitle;
}

/**
 * Section and page chips. Each opens the cited document.
 * Renders nothing unless NEXT_PUBLIC_CITATION_CHIPS_ENABLED is on.
 */
export function CitationChips({ citations }: { citations: readonly SourceCitation[] }) {
  if (!citationChipsEnabled() || citations.length === 0) return null;
  return (
    <ul className="mt-4 flex flex-wrap gap-2" data-chat-ui="citation-chips" aria-label="Citations">
      {citations.map((citation, index) => (
        <li key={`${citation.documentId}-${citation.locator}-${index}`}>
          <Link
            href={`/knowledge/document/${encodeURIComponent(citation.documentId)}`}
            className="inline-flex rounded-full border border-border-strong bg-surface px-3 py-1 text-[12px] font-semibold text-foreground hover:border-brand-accent"
          >
            {citationChipLabel(citation)}
          </Link>
        </li>
      ))}
    </ul>
  );
}
