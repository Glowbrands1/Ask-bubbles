# Migration-history reconciliation: Ask Bubbles production database

**Status: READ-ONLY REPORT. Nothing described here has been executed.** No row, object or setting in the
live database was changed to produce it. Prepared 2026-10-19 against the Ask Bubbles Supabase project
(`dyurgwieyltnhphihwwj`) and `origin/main` at `b334e61`.

## 1. Summary

- The live schema **matches the repo's migrations**, apart from the items in 3.1 to 3.3. The history table
  (`supabase_migrations.schema_migrations`) does not: 37 entries against 39 local files.
- **36 of 39** local files match a history entry exactly (version and name).
- **3 do not**: `20261014001000` (recorded under a different version and name), `20261015001000` and
  `20261016001000` (no entry). Their schema changes are all present on the live database.
- **The live database also holds objects that no repo migration creates** (3.3). They are defined in
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

### 3.0 Version-by-version

| # | Local version | Local file | Remote history entry | Schema changes present on live DB? | Proposed metadata action |
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
| 37 | `20261014001000` | `20261014001000_google_reviews_history.sql` | **none under this version.** Recorded instead as `20261014114127` `google_reviews_history_columns` | Yes (see 3.2) | rename/record (see 5) |
| 38 | `20261015001000` | `20261015001000_google_review_goals.sql` | **missing** | Yes (see 3.1) | record as applied (see 5) |
| 39 | `20261016001000` | `20261016001000_google_review_reporting_cutoff.sql` | **missing** | Yes (see 3.1) | record as applied (see 5) |
| — | _(no local file)_ | — | `20261014114127` `google_reviews_history_columns` | covered by local `20261014001000` (see 3.2) | reconcile (see 5) |

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

Usage counts at the time of checking: 7 active `app_users`; 3 `employee_account_links`, all `woven_linked`, all `admin_manual`,
every managed flag **false**; audit rows only of types `invited`, `invitation_accepted` and `role_changed`.

**Origin:** all three are defined in Ask Sunny's `supabase/migrations/20261006001000_woven_adoption_and_credentials.sql`
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

## 4. Proposed metadata correction: DO NOT RUN until approved

The recommended correction **adds records and rewrites none**. In particular it does not rename or edit the existing
`20261014114127` entry, because renaming would misstate the SQL that entry actually recorded.

### 4.1 Pre-flight checks (read-only; each must return `true`)

```sql
select count(*) = 37 from supabase_migrations.schema_migrations;
select count(*) = 0  from supabase_migrations.schema_migrations
  where version in ('20261014001000', '20261015001000', '20261016001000');
select to_regclass('public.google_review_goals') is not null;
select exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'google_review_goals' and column_name = 'count_from');
select exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'google_review_set_reporting_cutoff');
select exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'google_reviews_periods');
select exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'google_reviews' and column_name = 'reviewer_name');
```

### 4.2 The change (one transaction)

```sql
begin;
create table supabase_migrations.schema_migrations_backup_20261019 as
  table supabase_migrations.schema_migrations;

insert into supabase_migrations.schema_migrations (version, name, statements) values
  ('20261014001000', 'google_reviews_history',
   array['-- Recorded as applied by metadata reconciliation 2026-10-19. The objects were applied out of band; this row does not hold the executed SQL. See docs/migration-reconciliation-2026-10-19.md']),
  ('20261015001000', 'google_review_goals',
   array['-- Recorded as applied by metadata reconciliation 2026-10-19 (see docs/migration-reconciliation-2026-10-19.md)']),
  ('20261016001000', 'google_review_reporting_cutoff',
   array['-- Recorded as applied by metadata reconciliation 2026-10-19 (see docs/migration-reconciliation-2026-10-19.md)'])
on conflict (version) do nothing;

-- expect 40 rows, 3 of them new
select count(*) from supabase_migrations.schema_migrations;
commit;
```

The CLI has a command meant for this (`supabase migration repair --status applied <version>`). I have not verified what it
writes into `statements`; the SQL above is explicit about what it records. Either route needs a role that can write to the
`supabase_migrations` schema.

### 4.3 Repo-side companion (a separate PR, after approval)

Add a local file `20261014114127_google_reviews_history_columns.sql` holding the two `alter table ... add column if not exists`
statements the remote entry recorded (they are re-runnable). Without it, tooling that compares local files with the
remote history reports `20261014114127` as a remote version with no local file and stops until it is repaired. Together
with 4.2 that makes the two lists identical (40 and 40).

### 4.4 The live-only objects (3.3): decision needed

| Option | What it means | Assessment |
|---|---|---|
| A. Capture them in the repo (recommended) | A re-runnable migration (`create or replace` / `drop trigger if exists`) that defines the guard function and trigger and the 12-action audit check, recorded as applied like 4.2. Repo and production then agree, and PR #54 can be tested against the real thing. | Safest. Note that recreating the audit check re-validates existing rows; use the 12-action list, never the shorter one, or `managed_flags_changed` / `credentials_reset` rows (none exist today) would violate it. |
| B. Leave them unmanaged | Document only. | Anyone building a fresh environment from the repo gets different behaviour from production (no guard trigger, shorter audit vocabulary). PR #54 must still cope with the trigger. |
| C. Remove them | Drop the trigger, both functions, and narrow the audit check. | Not recommended before someone confirms who applied them and why. The guard is a protection, not clutter. |

## 5. Backup and rollback

**Before the change**
1. Confirm in the Supabase dashboard (Database, then Backups) that a recent daily backup or point-in-time recovery window
   exists, and take a manual snapshot if the plan allows. I could not see backup status with the tools available.
2. The 4.2 script copies the history table into `supabase_migrations.schema_migrations_backup_20261019` inside the same
   transaction. The current 37 rows are also listed in section 3.0 for the record.

**Rollback (metadata only; no schema or data is touched by the change)**
```sql
begin;
delete from supabase_migrations.schema_migrations
  where version in ('20261014001000', '20261015001000', '20261016001000')
    and statements[1] like '-- Recorded as applied by metadata reconciliation 2026-10-19%';
-- expect 37 rows again, identical to the backup
select count(*) = 37 and not exists (
  (select version, name from supabase_migrations.schema_migrations
   except select version, name from supabase_migrations.schema_migrations_backup_20261019)
) from supabase_migrations.schema_migrations;
commit;
-- after sign-off: drop table supabase_migrations.schema_migrations_backup_20261019;
```
If a rollback were ever needed beyond that, the backup table holds the full original rows.

## 6. Risks of the correction

1. **A version recorded as applied that is not.** Tooling would then skip it. Mitigation: the pre-flight checks and the object-level
   comparison above. The evidence is strongest for `20261015001000` and `20261016001000` (identical function definitions, columns
   present) and aggregate for `20261014001000`.
2. **Remote-only `20261014114127`.** Not fixed by 4.2 alone; needs 4.3.
3. **The marker text in `statements` is not the executed SQL.** Deliberate, so nobody mistakes it for a replayable record.
4. **Out-of-band objects stay unmanaged** under option B, and any fresh environment will behave differently from production.
5. **Recreating the audit check (option A)** re-validates existing rows and briefly takes a lock on `app_user_audit` (7 users; negligible, but it is a write).
6. **Process:** the same thing can happen again if migrations are applied by hand. The remote entries were created by people using the
   dashboard or a connector, and the two Ask Sunny objects have no history at all.
7. **PR #56 interaction:** with #56 merged, re-running `20261016001000` no longer fails. It is a safety net, not a substitute for correcting the history.

## 7. What needs an approval

1. Run 4.2 (the three history rows) on the production database.
2. Choose option A, B or C in 4.4.
3. Say who applied the Ask Sunny objects, if known, so it can be recorded.
4. Approve the repo-side companion in 4.3.
5. Nothing else in this report should be run without a separate go-ahead, and in particular no migration from PR #54.
