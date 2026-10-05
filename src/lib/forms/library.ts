import { COMPANY_FORMS } from "@/config/company/forms";

import type { TemplateSeed } from "./catalog";

/**
 * THE TEMPLATE SEEDS THIS BUILD SHIPS — read from the company forms registry.
 *
 * `ensureTemplateLibrary` writes these into `form_templates`. The list itself
 * is company configuration (`src/config/company/forms/`); this module is the
 * platform's single read of it.
 */
export const TEMPLATE_SEEDS: readonly TemplateSeed[] = COMPANY_FORMS.map((entry) => entry.seed);

/** The variant chat drafts by default, when a template declares variants. */
export function defaultVariantKey(templateKey: string): string | null {
  const seed = TEMPLATE_SEEDS.find((entry) => entry.key === templateKey);
  return seed?.variants[0]?.key ?? null;
}
