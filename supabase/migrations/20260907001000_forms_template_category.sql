-- ============================================================================
-- FORM TEMPLATE CATEGORY AND SEED REVISION.
--
-- `category` is the Forms page section a template renders under; plain text
-- checked against COMPANY_FORM_CATEGORIES in src/config/company/forms, so a new
-- heading is a config change rather than a migration. `seed_revision` lets the
-- seeder publish a new version when a registry form is re-issued, without ever
-- overwriting a version a person authored in the editor (revision 0).
-- ============================================================================

/*
 * WHICH SECTION OF THE FORMS PAGE A TEMPLATE RENDERS UNDER.
 *
 * Plain text, not an enum, and deliberately so: a category is a grouping the
 * app ships and the value is checked against `FORM_CATEGORIES` in
 * src/lib/forms/catalog.ts on the way out. Adding a category should be a code
 * change, not a schema change — an enum here would mean a migration every time
 * the business wanted a new heading.
 *
 * The default is the configured default category.
 */
alter table public.form_templates
  add column if not exists category text not null default 'examples';

comment on column public.form_templates.category is
  'Which section of the Forms page this template renders under. Checked against COMPANY_FORM_CATEGORIES in src/config/company/forms; examples is the default group.';

create index if not exists form_templates_by_category
  on public.form_templates (category, display_order);

-- --------------------------------------------------- the source revision ---

/*
 * WHICH READING OF THE PAPER FORM A VERSION WAS PUBLISHED FROM.
 *
 * The problem this solves: seeding skips a template whose key already exists,
 * which is right — it is what stops the code overwriting an administrator's
 * published edits. But it also meant that when the business re-issued a form,
 * the new document could never reach a database that already had the old one.
 * Without this column a re-issued form's first version would stay published
 * forever.
 *
 * So a seeded version records its seed's revision, and `ensureTemplateLibrary`
 * publishes a NEW version when the code's revision is higher than anything in
 * the table. The old version is archived, never edited and never deleted, so
 * forms already filled from it still render against it.
 *
 * 0 MEANS A PERSON WROTE IT. `openDraft` stores 0, so any version authored
 * through the editor is marked as such and the seeder stands down for that
 * template rather than publishing over somebody's work.
 *
 * The default of 1 is correct for every existing row: they are all version 1 as
 * originally seeded.
 */
alter table public.form_template_versions
  add column if not exists seed_revision integer not null default 1;

comment on column public.form_template_versions.seed_revision is
  'The revision of the source document this version was published from; 0 when a person authored it in the editor. Read only by ensureTemplateLibrary, which will not publish a seed revision over a version marked 0.';

alter table public.form_template_versions
  drop constraint if exists form_template_versions_seed_revision_not_negative;
alter table public.form_template_versions
  add constraint form_template_versions_seed_revision_not_negative
  check (seed_revision >= 0);
