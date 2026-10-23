import { printedPageOf } from "@/lib/ingestion/extract/pdf-sections";
import {
  officialManualProvenance,
  type ManualChunk,
  type ManualSection,
} from "@/lib/forms/official-policy-manual";

import { formatJbaCitation } from "./jba-citation";
import { citedSections } from "./violation-policy";

/**
 * A short citation for a coaching form, from chunk metadata.
 *
 * The page is the printed page on the chunk, a heading's own page, or a
 * footer the extractor already knows how to read. A missing page is left
 * out. Nothing here invents one, and an existing Direct policy line is
 * left alone.
 */

const NARRATIVE_KEY: Readonly<Record<string, string>> = {
  coaching: "coaching_details",
  "follow-up-coaching": "follow_up_observation",
};

export function citationPage(chunk: ManualChunk, heading: string): number | null {
  const listed = chunk.sections?.find((section) => section.heading.toLowerCase() === heading.toLowerCase());
  if (listed && listed.page > 0) return listed.page;
  if (typeof chunk.printedPage === "number" && chunk.printedPage > 0) return chunk.printedPage;
  for (const line of chunk.content.split("\n")) {
    const printed = printedPageOf(line);
    if (printed) return printed;
  }
  return null;
}

/** Policy name and page from the JBA Policy Manual. The manual's display title is kept when it is that source. */
export function formatManualCitation(heading: string, page: number | null, documentTitle?: string | null): string {
  return formatJbaCitation(heading, page, documentTitle);
}

export interface FlaggedManualIdentity {
  readonly documentId: string;
  readonly documentTitle: string;
  readonly matchedBy: "tag" | "fallback";
  readonly ownerConfirmed?: boolean;
}

export function flaggedCitationWrite(input: {
  readonly enabled: boolean;
  readonly templateKey: string;
  readonly values: Record<string, string>;
  readonly notes: string;
  readonly chunks: readonly ManualChunk[];
  readonly manual?: FlaggedManualIdentity | null;
}): { values: Record<string, string>; provenance: Record<string, Record<string, unknown>> } {
  if (!input.enabled) return { values: input.values, provenance: {} };
  const found = citedSections([input.notes], input.chunks);
  if (found.length === 0) return { values: input.values, provenance: {} };
  const line = found
    .map((item) => formatManualCitation(item.section, item.page, input.manual?.documentTitle))
    .join("; ");

  const narrative = NARRATIVE_KEY[input.templateKey];
  if (narrative) {
    const current = input.values[narrative] ?? "";
    if (current.includes(line)) return { values: input.values, provenance: {} };
    const next = current.trim() ? `${current.trim()}\n\nPolicy reference: ${line}` : `Policy reference: ${line}`;
    return { values: { ...input.values, [narrative]: next }, provenance: {} };
  }

  const paged = found.filter((item) => item.page !== null && item.page > 0);
  if (
    (input.templateKey === "dpoa" || input.templateKey === "policy-review") &&
    !(input.values.policy_language ?? "").trim() &&
    paged.length > 0 &&
    input.manual
  ) {
    const policy = paged
      .map((item) => formatManualCitation(item.section, item.page, input.manual?.documentTitle))
      .join("; ");
    const sections: ManualSection[] = paged.map((item) => ({
      heading: item.section,
      page: item.page ?? 0,
      chunkIndex: 0,
      foundBy: "page_heading",
    }));
    return {
      values: { ...input.values, policy_language: policy },
      provenance: {
        policy_language: officialManualProvenance({
          documentId: input.manual.documentId,
          documentTitle: input.manual.documentTitle,
          matchedBy: input.manual.matchedBy,
          ownerConfirmed: input.manual.ownerConfirmed,
          sections,
        }) as Record<string, unknown>,
      },
    };
  }
  return { values: input.values, provenance: {} };
}
