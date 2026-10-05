/**
 * THE CATEGORIES THE FORMS PAGE GROUPS BY, in display order. A leaf module —
 * no imports — because the platform catalog reads it and the form files read
 * the platform catalog; keeping this separate is what stops that being a cycle.
 *
 * A template whose category this build does not know falls into the LAST
 * section rather than off the page.
 */
export const COMPANY_FORM_CATEGORIES = [
  {
    key: "examples",
    label: "Examples — not approved Buff forms",
    blurb:
      "Placeholder forms that exercise the forms workflow. Not Buff City Soap policy; replace before rollout.",
  },
] as const;

/** Where a template with no recorded category is shown. */
export const DEFAULT_COMPANY_FORM_CATEGORY = "examples";

/**
 * Layout families a FORM may declare. A family is how the engine groups
 * documents of the same shape; it carries no business rule on its own.
 * Mirrored by the `form_layout_family` enum.
 */
export const FORM_LAYOUT_FAMILIES = [
  "standard",
  "coaching",
  "corrective",
  "review",
  "interview",
  "separation",
] as const;

/**
 * Families whose filed instances need an extra permission to READ, on top of
 * the ordinary register permission. Empty: no Buff form restricts reading yet.
 */
export const FORM_FAMILY_READ_PERMISSIONS: Readonly<Record<string, string>> = {};
