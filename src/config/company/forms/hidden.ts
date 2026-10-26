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
 * for its own front-desk role. (Its core-values heading no longer names the
 * sibling company: QA, 25 Oct 2026, `lib/forms/seed-sibling-brand.test.ts`.) Not a Buff City Soap form (QA, 25 Oct 2026). It was already withheld
 * from the chooser (`lib/forms/chooser.ts`); it still reached the template
 * list and the chat's forms library block from the database row.
 *
 * "First Round Management Interview Form" and "Second Round Management
 * Interview Form" — the reference platform's management interviews, whose
 * scenarios are about tanning beds, lotions and memberships and a Tanning
 * Consultant. Hidden the same way (Pau, via QA, 25 Oct 2026); also already
 * withheld from the chooser.
 */
export const HIDDEN_TEMPLATE_KEYS: readonly string[] = [
  "tanning-consultant-interview",
  "management-interview-round-1",
  "management-interview-round-2",
  /*
   * The six Employee Performance Plans — SDIT, TSD, ASD-SDIT, FTTC and both
   * DMIT readings. Their content came over from the sibling app with the rest
   * of the library, and Buff City Soap has no EPP of its own yet. Hidden (QA
   * decision, 26 Oct 2026). Config only: rows, versions and any form already
   * filed from them stay as they are, and such a form keeps rendering against
   * the version it pinned. Remove these lines when Buff City Soap's own plans
   * are in the library.
   */
  "sdit-epp",
  "tsd-epp",
  "asd-sdit-epp",
  "fttc-epp",
  "dmit-epp-tsd",
  "dmit-epp-dmit",
];

export function isHiddenTemplate(templateKey: string): boolean {
  return HIDDEN_TEMPLATE_KEYS.includes(templateKey);
}
