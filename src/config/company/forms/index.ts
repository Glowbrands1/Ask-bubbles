import type { TemplateSeed } from "@/lib/forms/catalog";
import { TEMPLATE_SEEDS } from "@/lib/forms/library";

export { COMPANY_FORM_CATEGORIES } from "./categories";


/**
 * ============================================================================
 * BUFF CITY SOAP — FORMS REGISTRY (COMPANY CONFIGURATION)
 * ============================================================================
 *
 * THE CATALOG IS THE MIGRATED HR LIBRARY. The seventeen templates — coaching,
 * follow-up coaching, corrective action, policy review, the six EPP templates,
 * demotion, position transfer, resignation/exit and the four hiring forms —
 * are the reference platform's current published versions, carried over with
 * only the approved branding changes (`src/lib/forms/library.ts` and the
 * exit, employment-change and hiring libraries beside it). Chat intent, inline
 * drafting, the chooser and revision follow those forms' own rules, ported
 * unchanged (`template-intent.ts`, `inline-draft.ts`, `chooser.ts`,
 * `revision.ts`).
 *
 * What this registry adds per form:
 *
 *   chatCorrectableFields
 *                   the header lines a manager may correct by saying so in
 *                   chat after the draft exists ("change the date to
 *                   yesterday", "her name is actually Jane Doe-Smith"). Saved
 *                   as the manager's own edit. Read only when the form's own
 *                   correction readers found nothing in the turn.
 *   status          "placeholder" forms are labelled as such everywhere.
 *
 * The original placeholder, "Team Member Check-In (Example)", is no longer
 * seeded; it is retired (switched off, never deleted) through
 * `RETIRED_TEMPLATE_KEYS` in `retired.ts`.
 */

export type CompanyFormStatus = "placeholder" | "approved";

/** Header lines the platform knows how to read a chat correction for. */
export type ChatCorrectableField = "employee_name" | "form_date";

export interface CompanyFormDefinition {
  readonly seed: TemplateSeed;
  readonly chatCorrectableFields: readonly ChatCorrectableField[];
  readonly status: CompanyFormStatus;
}

export const COMPANY_FORMS: readonly CompanyFormDefinition[] = TEMPLATE_SEEDS.map((seed): CompanyFormDefinition => ({
  seed,
  chatCorrectableFields: ["employee_name", "form_date"],
  status: "approved",
}));

export function companyFormFor(key: string): CompanyFormDefinition | undefined {
  return COMPANY_FORMS.find((entry) => entry.seed.key === key);
}
