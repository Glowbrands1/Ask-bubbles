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

/*
 * The in-training Employee Performance Plans of the reference platform (SDIT, and the DMIT plan read as TSD or DMIT):
 * Buff City Soap has no in-training position on its Woven career ladder, so they stay hidden (Pau, 23 Nov 2026).
 * Hidden only: not renamed, not deleted, so removing these lines brings them back.
 *
 * UNHIDDEN 23 Nov 2026 (Pau, via QA: "ok all ur picks"), renamed to Buff City Soap titles with the forms' wording in
 * Buff City Soap terms: the Team Member, Assistant General Manager and General Manager Performance EPPs (keys
 * fttc-epp, asd-sdit-epp, tsd-epp), the Team Member Interview Form (key tanning-consultant-interview) and the two
 * management interviews. Keys stay, so stored forms, versions and the sibling app's shared code keep their names.
 */
export const HIDDEN_TEMPLATE_KEYS: readonly string[] = [
  "sdit-epp",
  "dmit-epp-tsd",
  "dmit-epp-dmit",
];

export function isHiddenTemplate(templateKey: string): boolean {
  return HIDDEN_TEMPLATE_KEYS.includes(templateKey);
}
