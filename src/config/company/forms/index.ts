import type { TemplateSeed } from "@/lib/forms/catalog";

export { COMPANY_FORM_CATEGORIES } from "./categories";

import { EXAMPLE_CHECK_IN_SEED } from "./example-check-in";

/**
 * ============================================================================
 * BUFF CITY SOAP — FORMS REGISTRY (COMPANY CONFIGURATION)
 * ============================================================================
 *
 * THE ONE PLACE THE FORM CATALOG IS DECLARED. The forms ENGINE — documents,
 * field responsibilities, drafting, versioning, PDF rendering, the register,
 * follow-ups, and the chat workflow that proposes, drafts and revises a form —
 * is platform code and does not know which forms exist. Everything it needs to
 * know about one form is on its entry here:
 *
 *   seed            the template: document schema, permission, category.
 *                   Written into `form_templates` by `ensureTemplateLibrary`.
 *   intentPhrases   how a manager NAMES this form in chat ("check-in form").
 *                   Explicit namings only — never the bare word "form".
 *   inlineDraft     whether chat creates and drafts it in the thread.
 *   offeredInChooser whether it appears on "which form do you need?".
 *   checkEmployeeName whether a typed name is checked against the employee
 *                   directory before the form is proposed.
 *   revisable       whether chat may rewrite its drafted fields afterwards.
 *   chatCorrectableFields
 *                   the header lines a manager may correct by saying so in
 *                   chat after the draft exists ("change the date to
 *                   yesterday", "change the name to Jane Doe-Smith"). Saved as
 *                   the manager's own edit. Empty: no chat corrections.
 *   clarifyOn       the verb and noun that mean advice as often as this
 *                   form — { verb: "coach", noun: "coaching" } makes "coach
 *                   Avery" and "Avery needs coaching" one question: guidance,
 *                   or this form? Null: never asked. At most one form should
 *                   claim a given verb.
 *   status          "placeholder" forms are labelled as such everywhere.
 *
 * TO REPLACE THE CATALOG: add one file per Buff form beside this one, list it
 * below, and delete the example. Nothing else in the codebase names a form.
 */

export type CompanyFormStatus = "placeholder" | "approved";

/** Header lines the platform knows how to read a chat correction for. */
export type ChatCorrectableField = "employee_name" | "form_date";

export interface CompanyFormDefinition {
  readonly seed: TemplateSeed;
  readonly intentPhrases: readonly string[];
  readonly inlineDraft: boolean;
  readonly offeredInChooser: boolean;
  readonly checkEmployeeName: boolean;
  readonly revisable: boolean;
  readonly chatCorrectableFields: readonly ChatCorrectableField[];
  readonly clarifyOn: { readonly verb: string; readonly noun: string } | null;
  readonly status: CompanyFormStatus;
}

export const COMPANY_FORMS: readonly CompanyFormDefinition[] = [
  {
    seed: EXAMPLE_CHECK_IN_SEED,
    intentPhrases: [
      "check-in form",
      "check in form",
      "checkin form",
      "team member check-in",
      "team member check in",
      "example check-in",
      "example form",
    ],
    inlineDraft: true,
    offeredInChooser: true,
    checkEmployeeName: true,
    revisable: true,
    chatCorrectableFields: ["employee_name", "form_date"],
    clarifyOn: null,
    status: "placeholder",
  },
];

/**
 * The form the chooser leads with when a manager asks for "a form" without
 * naming one. Null leads with the first offered form.
 */
export const PRIMARY_FORM_KEY: string | null = null;

export function companyFormFor(key: string): CompanyFormDefinition | undefined {
  return COMPANY_FORMS.find((entry) => entry.seed.key === key);
}
