import { printedPageOf } from "@/lib/ingestion/extract/pdf-sections";
import { manualGroundedPolicies, policyFieldValue } from "@/lib/forms/policy-citation";
import {
  approvedManualConfirmed,
  officialManualProvenance,
  type ManualChunk,
  type ManualSection,
} from "@/lib/forms/official-policy-manual";

import { accountManualSections } from "./account-manual-sections";

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

/**
 * The page a retrieval row prints, for a check that must not use the PDF
 * sheet number. A footer the extractor knows, or a locator whose page is
 * not the PDF page, is that printed page. The PDF `page` column is not.
 */
export function printedPageFromRetrieval(row: {
  readonly page: number | null;
  readonly locator?: string | null;
  readonly content?: string | null;
}): number | null {
  for (const line of (row.content ?? "").split("\n")) {
    const printed = printedPageOf(line);
    if (printed) return printed;
  }
  const match = /\bPage\s+(\d+)\b/i.exec(row.locator ?? "");
  if (!match) return null;
  const printed = Number(match[1]);
  if (!Number.isInteger(printed) || printed <= 0) return null;
  if (row.page !== null && printed === row.page) return null;
  return printed;
}

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

/**
 * Policy name and page from the JBA Policy Manual.
 *
 * "Attendance" is written "Attendance Policy". A heading that already says
 * Policy keeps its own name. The page is the chunk's page.
 */
export function formatManualCitation(heading: string, page: number | null): string {
  const trimmed = heading.trim();
  const name = /policy/i.test(trimmed) ? trimmed : `${trimmed} Policy`;
  return page && page > 0 ? `${name}, JBA Policy Manual p.${page}` : `${name}, JBA Policy Manual`;
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
  const found = accountManualSections(input.notes, input.chunks).map((section) => ({
    section: section.heading,
    page: section.page > 0 ? section.page : null,
  }));
  if (found.length === 0) return { values: input.values, provenance: {} };
  const line = found
    .map((item) => formatManualCitation(item.section, item.page))
    .join("; ");

  const narrative = NARRATIVE_KEY[input.templateKey];
  if (narrative) {
    const current = input.values[narrative] ?? "";
    if (current.includes(line)) return { values: input.values, provenance: {} };
    const next = current.trim() ? `${current.trim()}\n\nPolicy reference: ${line}` : `Policy reference: ${line}`;
    return { values: { ...input.values, [narrative]: next }, provenance: {} };
  }

  const paged = found.filter((item) => item.page !== null && item.page > 0);
  const writesPolicyLine =
    input.templateKey === "dpoa" ||
    input.templateKey === "policy-review" ||
    Object.prototype.hasOwnProperty.call(input.values, "policy_language");
  if (writesPolicyLine && paged.length > 0 && input.manual) {
    const policy = paged
      .map((item) => formatManualCitation(item.section, item.page))
      .join("; ");
    const current = (input.values.policy_language ?? "").trim();
    const alreadyCited =
      current !== "" &&
      paged.every(
        (item) =>
          current.toLowerCase().includes(item.section.toLowerCase()) &&
          (current.includes(`p.${item.page}`) || current.toLowerCase().includes(`page ${item.page}`)),
      );
    if (alreadyCited) return { values: input.values, provenance: {} };
    const next = current ? `${current}\n\n${policy}` : policy;
    const sections: ManualSection[] = paged.map((item) => ({
      heading: item.section,
      page: item.page ?? 0,
      chunkIndex: 0,
      foundBy: "page_heading",
    }));
    return {
      values: { ...input.values, policy_language: next },
      provenance: {
        policy_language: officialManualProvenance({
          documentId: input.manual.documentId,
          documentTitle: input.manual.documentTitle,
          matchedBy: input.manual.matchedBy,
          ownerConfirmed: approvedManualConfirmed(input.manual),
          sections,
        }) as Record<string, unknown>,
      },
    };
  }
  return { values: input.values, provenance: {} };
}

/**
 * Passages to pin on a search answer when the account resolves a manual
 * section. Empty when nothing resolved, so the model is not handed a policy
 * the manual did not return.
 */
export function pinnedManualBlock(notes: string, chunks: readonly ManualChunk[], jobTitle?: string | null): string | null {
  const sections = accountManualSections(notes, chunks, jobTitle);
  if (sections.length === 0) return null;
  const paged = sections.filter((section) => section.page > 0);
  const quoted =
    paged.length > 0
      ? policyFieldValue(
          manualGroundedPolicies(
            { documentId: "pinned", documentTitle: "JBA Policy Manual", chunks },
            paged,
          ),
        )
      : null;
  const lines = sections.map((section) => formatManualCitation(section.heading, section.page > 0 ? section.page : null));
  const body = [quoted, ...lines].filter((part): part is string => Boolean(part && part.trim())).join("\n\n");
  if (!body.trim()) return null;
  return `POLICY FROM THE JBA POLICY MANUAL\n\nRetrieved for this account from the JBA Policy Manual. If you quote a section listed here, do not say the documents do not contain it.\n\n${body}`;
}
