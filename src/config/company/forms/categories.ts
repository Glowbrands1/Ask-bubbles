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
    key: "hr_performance",
    label: "HR & Performance Forms",
    blurb:
      "Coaching, corrective action and performance plans for people already on the team.",
  },
  {
    key: "separation",
    label: "Separation & Exit Forms",
    blurb: "Resignation and exit paperwork for an employee who is leaving the team.",
  },
  {
    key: "employment_changes",
    label: "Employment Change Forms",
    blurb:
      "Demotions and position transfers for people already on the team.",
  },
  {
    key: "hiring",
    label: "Hiring & Interview Forms",
    blurb:
      "Prescreening and interview forms, used while a candidate is still a candidate.",
  },
  {
    key: "examples",
    label: "Examples — not approved Buff forms",
    blurb:
      "Placeholder forms that exercise the forms workflow. Not Buff City Soap policy; replace before rollout.",
  },
] as const;

/** Where a template with no recorded category is shown. */
export const DEFAULT_COMPANY_FORM_CATEGORY = "hr_performance";

/**
 * Layout families a FORM may declare. A family is how the engine groups
 * documents of the same shape; it carries no business rule on its own.
 * Mirrored by the `form_layout_family` enum.
 */
export const FORM_LAYOUT_FAMILIES = [
  // The migrated HR library's families (database enum values).
  "coaching",
  "corrective",
  "epp",
  "dmit_epp",
  "interview",
  "exit",
  // This deployment's original generic families, kept for existing rows.
  "standard",
  "review",
  "separation",
] as const;

export const FORM_LAYOUT_FAMILY_LABEL: Readonly<Record<(typeof FORM_LAYOUT_FAMILIES)[number], string>> = {
  coaching: "Coaching",
  corrective: "Corrective",
  epp: "EPP",
  dmit_epp: "DMIT EPP",
  interview: "Interview",
  exit: "Exit",
  standard: "Standard",
  review: "Review",
  separation: "Separation",
};

/**
 * Families whose filed instances need an extra permission to READ, on top of
 * the ordinary register permission. Empty: no Buff form restricts reading yet.
 */
export const FORM_FAMILY_READ_PERMISSIONS: Readonly<Record<string, string>> = {
  // An exit record carries payroll, rehire and termination answers.
  exit: "create_exit_form",
};
