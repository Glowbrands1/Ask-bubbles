/**
 * TEMPLATES THIS DEPLOYMENT HIDES FROM EVERY LIST IT READS.
 *
 * A key listed here is left out of `listTemplateSummaries()` — the Form
 * Templates page, `GET /api/forms/templates`, the chat's forms library, its
 * proposals and its intent reading all start from that one list — and a new
 * form cannot be created from it. NOTHING IN THE DATABASE IS CHANGED: the
 * row, its versions and its assets stay exactly as they are, and the seeder
 * still keeps the row in step with the code. Removing a line here brings the
 * template back everywhere.
 *
 * This is not `RETIRED_TEMPLATE_KEYS` (`retired.ts`), which writes
 * `active = false` the next time the library is installed. Whether the row
 * should also be switched off, or deleted by a migration, is the business's
 * decision; this list only stops the code from showing it.
 */

/**
 * "Tanning Consultant Interview Form" — the reference platform's interview
 * for its own front-desk role, with the sibling company's core values printed
 * on it. Not a Buff City Soap form (QA, 25 Oct 2026). It was already withheld
 * from the chooser (`lib/forms/chooser.ts`); it still reached the template
 * list and the chat's forms library block from the database row.
 */
export const HIDDEN_TEMPLATE_KEYS: readonly string[] = ["tanning-consultant-interview"];

export function isHiddenTemplate(templateKey: string): boolean {
  return HIDDEN_TEMPLATE_KEYS.includes(templateKey);
}
