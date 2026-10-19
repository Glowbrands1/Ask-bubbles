# Migration-history reconciliation: Ask Bubbles production database

**Status: READ-ONLY REPORT. Nothing described here has been executed.** No row, object or setting in the
live database was changed to produce it. Prepared 2026-10-19 against the Ask Bubbles Supabase project
(`dyurgwieyltnhphihwwj`) and `origin/main` at `b334e61`.

## 1. Summary

- The live schema **matches the repo's migrations**, apart from the items in 3.1 to 3.3. The history table
  (`supabase_migrations.schema_migrations`) does not: 37 entries against 39 local files.
- **37 of 41** local files now match a history entry exactly (version and name), counting the new placeholder for `20261014114127`.
- **3 existing files do not**: `20261014001000`, `20261015001000` and `20261016001000` (no entry). **Only two of them are fully applied.**
  `20261015001000` and `20261016001000` are. `20261014001000` is only **partly** applied (its `drop function` has not taken effect), so it must not
  be recorded as applied (see 4.1). The fourth new file, `20261017001000`, captures the hand-applied objects and is a no-op on production.
- **The live database also holds four objects that no repo migration creates** (3.3), including a column-level `UPDATE` grant I had not expected. They are defined in
  Ask Sunny's `20261006001000_woven_adoption_and_credentials.sql`, applied by hand, with Windows line endings.
  One of them (a trigger on `employee_account_links`) **blocks the migration in PR #54** on production, even though
  every local test passes. See 3.3.
- Why the history matters: standard migration tooling decides what to apply from this table. Today it would
  try to apply `20261014001000`, `20261015001000` and `20261016001000` again. `20261016001000` fails when
  re-applied (a trigger is created without dropping it first). PR #56 fixes that file. The history table
  itself has not been touched.

## 2. How this was checked (all read-only)

1. Listed the history table and the repo's `supabase/migrations` on `main`.
2. Built a throwaway Postgres 16 + pgvector database from the repo's 39 migrations (`scripts/db/verify-migrations.sh`)
   and compared it with the live database, object by object, using hashes of: every `public` table's columns
   (name, type, nullability, default), indexes, constraints, policies, triggers, views and functions. Function bodies
   were compared with SQL comments stripped and whitespace normalised.
3. Read the definitions of every object that differed, and the execute privileges of the ones that matter.
4. Counted (never read) rows in `app_user_audit`, `employee_account_links` and `app_users` to see whether the extra
   objects were ever used.

**Not checked:** table and function privileges in general (only the Google reviews functions and the three objects
in 3.3), the `auth` and `storage` schemas, extensions, scheduled jobs, and row data. A hash match for a category
is aggregate evidence, not a per-migration proof.

## 3. Findings

### 3.0 Version-by-version (current repo: 41 files; the live history has 37 entries)

| # | Local version | Local file | Remote history entry | Schema changes present on the live DB? | Proposed action |
|---|---|---|---|---|---|
| 1 | `20260829000100` | `20260829000100_extensions.sql` | `20260829000100` `extensions` | Yes | none |
| 2 | `20260829000200` | `20260829000200_knowledge_schema.sql` | `20260829000200` `knowledge_schema` | Yes | none |
| 3 | `20260829000300` | `20260829000300_match_knowledge_chunks.sql` | `20260829000300` `match_knowledge_chunks` | Yes | none |
| 4 | `20260829000400` | `20260829000400_rls.sql` | `20260829000400` `rls` | Yes | none |
| 5 | `20260829000500` | `20260829000500_storage_bucket.sql` | `20260829000500` `storage_bucket` | Yes | none |
| 6 | `20260831000600` | `20260831000600_rls_privilege_hardening.sql` | `20260831000600` `rls_privilege_hardening` | Yes | none |
| 7 | `20260831000700` | `20260831000700_pin_function_search_path.sql` | `20260831000700` `pin_function_search_path` | Yes | none |
| 8 | `20260831000800` | `20260831000800_embedding_dimensions_384.sql` | `20260831000800` `embedding_dimensions_384` | Yes | none |
| 9 | `20260831000900` | `20260831000900_reporting_framework.sql` | `20260831000900` `reporting_framework` | Yes | none |
| 10 | `20260904001000` | `20260904001000_forms_engine.sql` | `20260904001000` `forms_engine` | Yes | none |
| 11 | `20260904002000` | `20260904002000_forms_guard_execute_revoke.sql` | `20260904002000` `forms_guard_execute_revoke` | Yes | none |
| 12 | `20260904003000` | `20260904003000_forms_instance_archive.sql` | `20260904003000` `forms_instance_archive` | Yes | none |
| 13 | `20260904003100` | `20260904003100_forms_event_kind_archive.sql` | `20260904003100` `forms_event_kind_archive` | Yes | none |
| 14 | `20260904004000` | `20260904004000_forms_follow_up_tracking.sql` | `20260904004000` `forms_follow_up_tracking` | Yes | none |
| 15 | `20260904004100` | `20260904004100_forms_event_kind_follow_up.sql` | `20260904004100` `forms_event_kind_follow_up` | Yes | none |
| 16 | `20260904006000` | `20260904006000_app_users.sql` | `20260904006000` `app_users` | Yes | none |
| 17 | `20260905001000` | `20260905001000_accept_invitation.sql` | `20260905001000` `accept_invitation` | Yes | none |
| 18 | `20260905001100` | `20260905001100_audit_action_vocabulary.sql` | `20260905001100` `audit_action_vocabulary` | Yes | none |
| 19 | `20260907001000` | `20260907001000_forms_template_category.sql` | `20260907001000` `forms_template_category` | Yes | none |
| 20 | `20260907002000` | `20260907002000_forms_version_proposal.sql` | `20260907002000` `forms_version_proposal` | Yes | none |
| 21 | `20260911001000` | `20260911001000_activity_analytics.sql` | `20260911001000` `activity_analytics` | Yes | none |
| 22 | `20260915001000` | `20260915001000_knowledge_backfill_snapshot_rls.sql` | `20260915001000` `knowledge_backfill_snapshot_rls` | Yes | none |
| 23 | `20260915002000` | `20260915002000_assistant_feedback.sql` | `20260915002000` `assistant_feedback` | Yes | none |
| 24 | `20260921002000` | `20260921002000_chat_history.sql` | `20260921002000` `chat_history` | Yes | none |
| 25 | `20260928002000` | `20260928002000_woven_employee_directory.sql` | `20260928002000` `woven_employee_directory` | Yes | none |
| 26 | `20260929001000` | `20260929001000_woven_knowledge_sync.sql` | `20260929001000` `woven_knowledge_sync` | Yes | none |
| 27 | `20260930000100` | `20260930000100_woven_employee_role_overrides.sql` | `20260930000100` `woven_employee_role_overrides` | Yes | none |
| 28 | `20260930001000` | `20260930001000_woven_knowledge_inventory.sql` | `20260930001000` `woven_knowledge_inventory` | Yes | none |
| 29 | `20260930002000` | `20260930002000_knowledge_document_superseded.sql` | `20260930002000` `knowledge_document_superseded` | Yes | none |
| 30 | `20261002001000` | `20261002001000_auth_revocation_hardening.sql` | `20261002001000` `auth_revocation_hardening` | Yes | none |
| 31 | `20261002002000` | `20261002002000_woven_account_links.sql` | `20261002002000` `woven_account_links` | Yes | none |
| 32 | `20261003001000` | `20261003001000_knowledge_server_only.sql` | `20261003001000` `knowledge_server_only` | Yes | none |
| 33 | `20261006001000` | `20261006001000_woven_knowledge_communications.sql` | `20261006001000` `woven_knowledge_communications` | Yes | none |
| 34 | `20261008001000` | `20261008001000_forms_library_migration.sql` | `20261008001000` `forms_library_migration` | Yes | none |
| 35 | `20261012001000` | `20261012001000_woven_employee_company_scope.sql` | `20261012001000` `woven_employee_company_scope` | Yes | none |
| 36 | `20261013001000` | `20261013001000_google_reviews.sql` | `20261013001000` `google_reviews` | Yes | none |
| 37 | `20261014001000` | `20261014001000_google_reviews_history.sql` | **none** (its smaller sibling `20261014114127` is recorded) | **PARTIAL.** The legacy 4-argument overload that this file drops still exists, and `google_reviews_monthly` differs. Everything else present. | **do NOT record as applied; apply the file** (4.2 step 2) |
| 38 | `20261014114127` | `20261014114127_google_reviews_history_columns.sql` | `20261014114127` `google_reviews_history_columns` | Yes (**placeholder**: exactly the two recorded statements; see 3.2) | none |
| 39 | `20261015001000` | `20261015001000_google_review_goals.sql` | **missing** | **Yes, fully.** Objects, privileges, row security, triggers, comments, and (for 15) the 7 seed rows. See 4.1 | record as applied (4.2 step 1) |
| 40 | `20261016001000` | `20261016001000_google_review_reporting_cutoff.sql` | **missing** | **Yes, fully.** Objects, privileges, row security, triggers, comments, and (for 15) the 7 seed rows. See 4.1 | record as applied (4.2 step 1) |
| 41 | `20261017001000` | `20261017001000_capture_live_only_woven_adoption_objects.sql` | _new; not applied anywhere_ | Production already has all four objects; this migration is a **no-op there** and creates them elsewhere | applied by tooling (4.2 step 2) |

### 3.1 `20261015001000` and `20261016001000`: applied, never recorded

Every object they create exists on the live database, and every function they define is **identical** to the repo's
after comment-stripping: tables `google_review_goals` (including the five `count_from*` columns), functions
`google_review_set_baselines`, `google_review_goal_counts`, `google_review_goal_counts_v2`,
`google_review_set_reporting_cutoff`, `google_reviews_periods`, and both guard functions and triggers.

### 3.2 `20261014001000` versus the remote `20261014114127 google_reviews_history_columns`

- The remote entry is **not** the repo file renamed. Its recorded statements are two `alter table ... add column if not exists`
  statements (433 characters): `reviewer_name` on `google_reviews` and three `api_*` columns on `google_review_locations`.
- The repo file is 222 lines. The rest of it (`google_review_apply_reviews`, `google_reviews_search`,
  `google_reviews_monthly`, two views) reached the database by another route. They are present.
- Function comparison: `claim_run`, `record_link` and the 6-argument `apply_reviews` are identical to the repo's
  after comment-stripping. `google_reviews_monthly` differs in text but not in meaning: the repo reads the
  `google_reviews_feed` view, which is exactly the join the live version spells out (the two views are identical).
- A **leftover 4-argument `google_review_apply_reviews`** exists on the live database; the repo file drops it. It is
  executable by `service_role` only, not by `anon`, `authenticated` or `public`. It is not an exposure.

### 3.3 Objects on the live database that NO repo migration creates

| Object | What it does | Who can run it | Used? |
|---|---|---|---|
| Trigger `employee_account_links_guard_update` (BEFORE UPDATE on `employee_account_links`) and its function | Blocks any update that changes anything except `managed_status`, `managed_location`, `managed_role` and `updated_at` | trigger; function not executable by `anon`, `authenticated` or `service_role` | fires on every link update |
| Function `auth_clear_user_credentials(uuid)` (security definer) | Blanks a user's password and deletes their sessions and refresh tokens | `service_role` only | no repo code calls it |
| `app_user_audit_action_check` allows two extra actions: `managed_flags_changed`, `credentials_reset` | widens the audit vocabulary | n/a | no row uses them |
| Column-level `UPDATE` grant to `service_role` on exactly `managed_status`, `managed_location`, `managed_role` of `employee_account_links` | lets the server edit what Woven may manage for a link; no other column | `service_role` | none of the 3 links has any flag on |

Usage counts at the time of checking: 7 active `app_users`; 3 `employee_account_links`, all `woven_linked`, all `admin_manual`,
every managed flag **false**; audit rows only of types `invited`, `invitation_accepted` and `role_changed`.

**Origin:** all four are defined in Ask Sunny's `supabase/migrations/20261006001000_woven_adoption_and_credentials.sql`
(checked by name against that repo's `main`). That file has the same version number as Ask Bubbles' own
`20261006001000_woven_knowledge_communications`, which is the one the history records. Nothing in either repo or the
history says who applied the Sunny objects or when, and no row was ever written with the Sunny-only actions, so that needs a
person to answer. Ask Sunny's separate `data-changes/20261006_woven_status_managed_sd_asd.sql` does **not** appear to have been run
here: every Ask Bubbles link has all managed flags off.

**Why it matters for PR #54:** that migration stamps `terminated_at`, `reactivated_at`, `revoked_woven_status`,
`last_synced_at` and `access_revoked_at` on `employee_account_links` from security-definer functions. The live trigger would
raise `check_violation` on every one of those updates, so enforcement and rehire would fail in production while the local
tests (built from the repo only) pass. The termination work is being changed to run its tests against this
production-parity trigger and to manage the guard itself.

### 3.4 Differences that are NOT real

- `knowledge_chunks` (table, vector index) and `match_knowledge_chunks`: the live database writes the `vector` type unqualified,
  my throwaway database qualifies it as `extensions.`. Same objects.
- Comment-only differences in the functions listed in 3.2.
- All 13 views and the one policy are identical.

## 4. Validated plan: DO NOT RUN until approved

### 4.1 Each proposed history entry, validated against the schema and the file contents

A history entry means "this file's changes are in place". An entry is only proposed where **every** statement of the file has been shown to be in
place. Evidence: a disposable database that reproduces the live state (`scripts/db/verify-production-parity.sh`, see section 5) matches the live
database on all 13 fingerprint categories, so a file's effects on the live database can be read from the repo.

| Migration | What it does | Validation | Decision |
|---|---|---|---|
| `20261015001000_google_review_goals` | table `google_review_goals`, seed one goal row per store, row security (forced), 2 triggers, 3 functions, grants, a table comment | Table, constraints, triggers, row security, grants and the comment are identical on the live database. The 3 functions are identical after comments are stripped. Seeds: **7 stores, 7 goal rows, 0 stores without one, 0 null targets.** | **Fully applied. Record it.** |
| `20261016001000_google_review_reporting_cutoff` | 5 `count_from*` columns, a guard trigger and function, 3 functions, grants | All 5 columns present. The trigger, functions and grants are identical. | **Fully applied. Record it.** (Re-running the file failed before PR #56's one-line fix; now it is re-runnable.) |
| `20261014001000_google_reviews_history` | 2 columns, **drops the 4-argument `google_review_apply_reviews`**, creates the 6-argument one, a search function, a monthly function, 2 views, grants | Columns, the 6-argument function, the search function, both views and the grants are in place. **The 4-argument overload still exists** (2 overloads live; the file drops it) and `google_reviews_monthly` has the earlier body (same results, different text). | **Partly applied. Do NOT record it.** Apply the file (4.2 step 2); tooling then records it. |
| `20261014114127_google_reviews_history_columns` | already recorded: two `alter table ... add column if not exists` statements | The placeholder file reproduces exactly those statements and says it is not the larger file. | **No history change.** Repo file only. |
| `20261017001000_capture_live_only_woven_adoption_objects` | four hand-applied Ask Sunny-derived objects | Every step is conditional on the object being absent. On the production-like database the objects are unchanged afterwards, byte for byte; on a fresh database they are created. The created definitions hash-match the live ones. | **No-op on production.** Applied by tooling. |

### 4.2 Exact production sequence (each step needs its own approval)

**Step 0, read-only pre-flight** (every query must return `true`; none writes):
```sql
select count(*) = 37 from supabase_migrations.schema_migrations;
select count(*) = 0  from supabase_migrations.schema_migrations
  where version in ('20261014001000', '20261015001000', '20261016001000', '20261017001000');
select (select count(*) from public.google_review_goals) = (select count(*) from public.google_review_locations);   -- 7 = 7 today
select exists (select 1 from information_schema.columns where table_schema='public' and table_name='google_review_goals' and column_name='count_from');
select (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='google_review_apply_reviews') = 2;  -- the leftover overload
```

**Step 1, history only, no schema change** (one transaction):
```sql
begin;
create table supabase_migrations.schema_migrations_backup_20261019 as table supabase_migrations.schema_migrations;
insert into supabase_migrations.schema_migrations (version, name, statements) values
  ('20261015001000', 'google_review_goals',
   array['-- Recorded as applied by metadata reconciliation 2026-10-19; every statement was verified present. See docs/migration-reconciliation-2026-10-19.md']),
  ('20261016001000', 'google_review_reporting_cutoff',
   array['-- Recorded as applied by metadata reconciliation 2026-10-19; every statement was verified present. See docs/migration-reconciliation-2026-10-19.md'])
on conflict (version) do nothing;
select count(*) from supabase_migrations.schema_migrations;   -- expect 39
commit;
```
Only two rows are added. `20261014001000` is deliberately **not** inserted.

**Step 2, apply what is still pending, with the normal tooling.** Two files are pending: `20261014001000` and `20261017001000`.
- Because `20261014001000` sorts **before** the newest history entry (`20261014114127`), the Supabase CLI will normally refuse it unless told to
  include earlier-dated files: `supabase db push --include-all`. Run `supabase db push --dry-run --include-all` first; it is read-only and lists
  exactly what it would apply, which must be those two files and nothing else. (I cannot run the CLI against the project from here, and I have
  not verified the CLI's exact behaviour; the dry run is the check.)
- What step 2 changes on production, as measured on the production-like database: it **drops the 4-argument `google_review_apply_reviews`**
  (a `service_role`-only overload) and **replaces the body of `google_reviews_monthly`** with the repository version (reads the identical view;
  same results). Nothing else changes: the harness lists exactly those four fingerprint lines (the overload's function, privilege and comment lines, plus the monthly function), and fails on any other.
- If the files are instead applied by hand, record their history rows with the real file contents as `statements`.

**Step 3, post-checks** (read-only):
```sql
select count(*) = 41 from supabase_migrations.schema_migrations;   -- 39 after step 1, plus 20261014001000 and 20261017001000
select (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='google_review_apply_reviews') = 1;
select pg_get_constraintdef(oid) like '%credentials_reset%' from pg_constraint where conname='app_user_audit_action_check';
```
Then re-run the fingerprint comparison (`scripts/db/fingerprint.sql`) against a fresh build; the two must be identical apart from the pgvector qualification artifact.

### 4.3 Backup and rollback

**Before:** confirm in the Supabase dashboard (Database, then Backups) that a recent backup or point-in-time recovery window exists, and take a manual snapshot
if the plan allows. I cannot see backup status with the tools I have. Step 1 also copies the history table.

**Rollback step 1 (metadata only):**
```sql
begin;
delete from supabase_migrations.schema_migrations
 where version in ('20261015001000', '20261016001000')
   and statements[1] like '-- Recorded as applied by metadata reconciliation 2026-10-19%';
select count(*) = 37 from supabase_migrations.schema_migrations;
commit;
-- after sign-off: drop table supabase_migrations.schema_migrations_backup_20261019;
```
**Rollback step 2 (schema):** both changes are reversible and touch no data. Re-create the 4-argument overload from `20261013001000_google_reviews.sql` (the function
that starts at `create or replace function public.google_review_apply_reviews(`, with its `revoke` and `grant`), and restore the earlier monthly body
(kept in `supabase/tests/fixtures/production_parity_state.sql`, section C). Delete the history rows for `20261014001000` and `20261017001000`. The capture migration has nothing to roll back on production (it changes nothing there).

## 5. Evidence

All of it ran on disposable local Postgres 16 + pgvector databases; nothing was written to any real project.

1. **The production-like database is faithful.** `scripts/db/fingerprint.sql` produces one line per object (tables with columns, indexes, constraints, policies, triggers,
   views, functions, relation / column / function privileges, row security, comments). Grouped into 13 categories (the `knowledge_chunks` objects excluded on both sides,
   because the live database writes the `vector` type unqualified and a local database qualifies it), **all 13 category hashes of the production-like database equal the live
   database's**. Postgres 17's extra `MAINTAIN` privilege on the live database is ignored on both sides.
2. **Production differs from a fresh build in exactly one allow-listed set:** the leftover overload (function, privilege and comment lines) and the monthly body. The harness fails on any other difference.
3. **Two reconciliation scenarios both converge to a fresh build (929 objects identical):** A (record `20261015001000` and `20261016001000`, then apply what is pending) and B (record nothing and apply everything pending).
4. **The capture is a no-op on the Ask Sunny-derived objects:** the guard, its trigger, the column grant, the 12-action audit list and `auth_clear_user_credentials` are byte-for-byte unchanged after the reconciliation.
5. **Re-applying every migration from `20261014001000` a second time changes nothing.**
6. `supabase/tests/capture_live_objects_checks.sql` passes on both scenarios and on a fresh build, including that the definitions the migration creates hash-match the **live** definitions.
7. Mutations caught: letting the guard accept a lifecycle stamp, and removing the column grant, each fail the check.
8. `npm run verify:migrations`: 41 migrations apply, and the three SQL check files pass.

Commands: `bash scripts/db/verify-production-parity.sh` and `bash scripts/db/verify-migrations.sh`.

## 6. Risks

1. **A version recorded as applied that is not.** Mitigated by recording only `20261015001000` and `20261016001000`, each validated object by object and (for 15) seed row by seed row. `20261014001000` is not recorded.
2. **Step 2 changes production objects.** It drops one `service_role`-only overload and refreshes one function with an equivalent body. Nothing in the repository calls the 4-argument form (the application sends the 6-argument parameters). Low risk, reversible (4.3).
3. **`supabase db push --include-all` could try more than expected.** The dry run is the guard: it must list exactly `20261014001000` and `20261017001000`.
4. **The marker text in `statements` is not the executed SQL.** Deliberate, so nobody mistakes it for a replayable record.
5. **The captured guard is only as faithful as the comparison.** Its definition hash-matches the live one, and the production-like database matches the live database on all categories; I have not byte-compared the CRLF text, and the live function's owner and privileges were read, not changed.
6. **PR #54 depends on this ordering.** Its migration is `20261019001000` and builds on the captured guard (`20261017001000`). Applying #54 first would fail on production.
7. **Process.** The Ask Sunny objects were applied by hand, with no history row. Nothing in either repository says who or when. Recommend migrations only through the repository and the CLI from here.
8. **Postgres 17 versus the local 16** differ in the `MAINTAIN` privilege and in how the `vector` type is qualified. Both are accounted for in the comparison, but a local database is not production.

## 7. What needs an approval

1. Step 1 (two history rows) and step 3's backup table on the production database.
2. Step 2 (`supabase db push --include-all`, after a dry run that lists exactly the two expected files).
3. Merging this PR after you have reviewed it. It stays a draft until then.
4. Who applied the Ask Sunny objects, if known (for the record).
5. Nothing in PR #54 may be applied, and enforcement stays OFF.
