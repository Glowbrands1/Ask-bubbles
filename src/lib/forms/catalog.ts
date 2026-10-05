import type { FormDocument, FormField, FormVariant } from "./document";

import {
  COMPANY_FORM_CATEGORIES,
  DEFAULT_COMPANY_FORM_CATEGORY,
  FORM_LAYOUT_FAMILIES,
} from "@/config/company/forms/categories";
import { FORM_LETTERHEAD_BRAND } from "@/config/company/forms/letterhead";

/**
 * WHAT A TEMPLATE IS, AND WHERE IT SITS IN THE LIBRARY.
 *
 * Platform types and helpers only. WHICH forms exist, and how they are grouped,
 * is company configuration under `src/config/company/forms/`.
 */

/** The letterhead brand line, as the editor's new-block default uses it. */
export const BRAND = FORM_LETTERHEAD_BRAND;

/**
 * One field, spelled short.
 *
 * `input` defaults to a single line because most of them are; a responsibility
 * has no default, because "who fills this" is the one thing about a field that
 * must never be inherited from a guess.
 */
export const field = (
  key: string,
  label: string,
  responsibility: FormField["responsibility"],
  input: FormField["input"] = "text",
  extra: Partial<FormField> = {},
): FormField => ({ key, label, input, responsibility, ...extra });

/* ---------------------------------------------------------- categories --- */

/** The categories the forms page groups by, in display order (company config). */
export const FORM_CATEGORIES = COMPANY_FORM_CATEGORIES;

export type FormCategoryKey = (typeof FORM_CATEGORIES)[number]["key"];

/** The category a row with none recorded falls back to. */
export const DEFAULT_FORM_CATEGORY = DEFAULT_COMPANY_FORM_CATEGORY as FormCategoryKey;

export function isFormCategory(value: unknown): value is FormCategoryKey {
  return FORM_CATEGORIES.some((category) => category.key === value);
}

export function formCategoryLabel(key: string): string {
  return FORM_CATEGORIES.find((category) => category.key === key)?.label ?? key;
}

/**
 * Templates split into the sections a screen renders, in category order.
 *
 * Driven by `FORM_CATEGORIES` rather than by the templates themselves, so the
 * sections always appear in the order this file declares and a category nobody
 * has put a form in yet does not print an empty heading.
 *
 * A template whose category THIS BUILD DOES NOT KNOW — a row written by a newer
 * deployment and read by an older one — falls into the last section rather than
 * off the page. A form an administrator cannot see is a form they cannot fix.
 */
export function groupTemplatesByCategory<T extends { category: string }>(
  templates: readonly T[],
): { key: string; label: string; blurb: string; templates: T[] }[] {
  const known = new Set<string>(FORM_CATEGORIES.map((category) => category.key));
  return FORM_CATEGORIES.map((category, index) => ({
    key: category.key as string,
    label: category.label as string,
    blurb: category.blurb as string,
    templates: templates.filter(
      (template) =>
        template.category === category.key ||
        (index === FORM_CATEGORIES.length - 1 && !known.has(template.category)),
    ),
  })).filter((category) => category.templates.length > 0);
}

/* ---------------------------------------------------------------- seed --- */

export type FormLayoutFamily = (typeof FORM_LAYOUT_FAMILIES)[number];

/**
 * WHERE A TEMPLATE'S SCHEMA WAS READ FROM, WHEN IT WAS NOT A PAPER FORM.
 *
 * Every other template in the library is a reading of a document the business
 * issues on paper: the seeder records a bundled default asset and the version's
 * notes name the source form. That is the default and it needs no annotation.
 *
 * One template is not. The Follow-Up Coaching Form is defined by a SECTION OF AN
 * APPROVED KNOWLEDGE-BASE FRAMEWORK — it names the form and specifies its fields
 * and its option lists — and no paper form for it was ever handed over. That is a
 * real difference and it has to be visible in the database rather than only in a
 * comment, because the question somebody asks months later is "which official
 * document is this form?" and for this one the honest answer is "none — it comes
 * from the framework".
 *
 * So a seed may declare its provenance, and the seeder writes it onto the
 * template's asset row in place of the plain `source: "bundled"` marker. Absent
 * means what it has always meant: this template reads a paper source form.
 */
export interface TemplateProvenance {
  /** Framework-defined. There is deliberately no `paper` case — that is the default. */
  kind: "framework";
  /** The knowledge-base document the schema was read out of. */
  document: string;
  /** The exact place in it, e.g. a section number and heading. */
  locator: string;
  /** Said in full, for whoever reads the row without this file to hand. */
  note: string;
}

export interface TemplateSeed {
  key: string;
  name: string;
  shortName: string;
  description: string;
  category: FormCategoryKey;
  layoutFamily: FormLayoutFamily;
  requiredPermission: string;
  displayOrder: number;
  document: FormDocument;
  variants: FormVariant[];
  /** Set only when the schema came from something other than a paper form. */
  provenance?: TemplateProvenance;
  /**
   * WHICH READING OF THE SOURCE DOCUMENT THIS IS.
   *
   * Bumped when the business hands over a NEW version of the paper form, never
   * for a wording tidy-up. The seeder publishes a template's revision once and
   * once only: a database already carrying revision 2 is left alone, and so is
   * one where an administrator has published a version of their own. See
   * `ensureTemplateLibrary`, which is the only thing that reads this.
   */
  revision: number;
  /** Says, in the version's own notes, which source it was published from. */
  revisionNote: string;
  /** The bundled document this template falls back to when nothing is uploaded. */
  bundledPdfName: string;
}
