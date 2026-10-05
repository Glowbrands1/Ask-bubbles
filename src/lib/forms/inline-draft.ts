import { COMPANY_FORMS } from "@/config/company/forms";

import type { FormVariant } from "./document";

/**
 * ============================================================================
 * WHICH FORMS CHAT CREATES AND DRAFTS IN THE THREAD
 * ============================================================================
 *
 * Declared per form in the company forms registry (`inlineDraft`). A form not
 * marked there can still be proposed, but chat says it cannot create it yet
 * rather than half-creating it.
 *
 * A template with several variants is not drafted inline: the variant decides
 * which fields exist, and chat does not choose it for a manager.
 */
export function variantsAllowInline(variants: readonly FormVariant[]): boolean {
  return variants.length <= 1;
}

export function inlineDraftVariantKey(variants: readonly FormVariant[]): string | null {
  return variants.length === 1 ? variants[0]!.key : null;
}

export function inlineDraftTemplateKeys(): string[] {
  return COMPANY_FORMS.filter((entry) => entry.inlineDraft).map((entry) => entry.seed.key);
}

export function supportsInlineDraft(
  templateKey: string,
  variants: readonly FormVariant[],
): boolean {
  return inlineDraftTemplateKeys().includes(templateKey) && variantsAllowInline(variants);
}
