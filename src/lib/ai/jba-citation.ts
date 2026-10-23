import { manualDisplayTitle } from "@/lib/forms/official-policy-manual";

/**
 * The policy source every citation names.
 *
 * The pinned manual's own title is used when that title is the JBA Policy
 * Manual. A page is included only when the chunk carries one. Nothing here
 * invents a page, and a short name for the manual is not a different source.
 */

export const JBA_POLICY_MANUAL = "JBA Policy Manual";

export function jbaManualName(documentTitle?: string | null): string {
  const displayed = documentTitle?.trim() ? manualDisplayTitle(documentTitle) : "";
  return /jba policy manual/i.test(displayed) ? displayed : JBA_POLICY_MANUAL;
}

/** Policy name and page, from the JBA Policy Manual. */
export function formatJbaCitation(heading: string, page: number | null, documentTitle?: string | null): string {
  const policy = heading.trim();
  const source = jbaManualName(documentTitle);
  if (!policy) return source;
  return page && page > 0 ? `${source} — ${policy} — Page ${page}` : `${source} — ${policy}`;
}
