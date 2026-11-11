# Phase 1: production migration-history reconciliation (NOTHING HERE HAS BEEN RUN ON PRODUCTION)

Phase 1 changes **only the migration record book** (`supabase_migrations.schema_migrations`). It changes no app table, function, permission or employee record.
It records two migrations (`20261015001000`, `20261016001000`) whose changes were verified object-by-object to already exist in the live database, and it keeps a backup copy of the record book first.
`20261014001000` is deliberately **not** recorded: it is only partly applied, and Phase 2 applies it properly.

Run by the Supabase project owner, in the SQL editor or `psql`, **as the `postgres` role**. Each step is its own approval.

| Step | File | Writes? |
|---|---|---|
| A. Pre-flight | `1-preflight-readonly.sql` | No. Every row, and the last row "ALL CHECKS OK", must be `true`. **STOP if any is false.** |
| B. The change | `2-step1-history.sql` | Yes: one transaction. It refuses unless the history is exactly as pre-flighted, and verifies itself before committing. |
| Rollback | `3-rollback.sql` | Yes: one transaction. Refuses unless the history is exactly "backup + the two marker rows". |

## Expected state

| | History rows | `20261015001000` | `20261016001000` | `20261014001000`, `20261017001000` | Backup table |
|---|---|---|---|---|---|
| **Before** (read-only check of the live project, 2026-10-19 and re-read just now) | **37** (newest `20261014114127`) | absent | absent | absent | absent |
| **After step B** | **39** | present, statements = marker comment | present, marker | absent | `schema_migrations_backup_20261019`, **37** rows, identical to the "before" history |
| **After rollback** | **37**, identical to before (checked by comparing every row with the backup) | absent | absent | absent | still present until the owner drops it |

Step B prints `39 | 37` (history rows after, backup rows). The rollback prints `37`.

## What was proven, and where (disposable local Postgres only; never the live project)
Run on a database that reproduces the live state (all 13 fingerprint categories match the live database):
- Pre-flight: all 13 checks true on the clean state; with a backup present, or one unexpected history row, the right checks go false (and "ALL CHECKS OK" with them).
- Step B: 37 to 39, backup 37 rows; **run a second time it refuses** ("expected exactly 37 history rows"); an unexpected extra row also makes it refuse.
- Rollback: history identical to before (checksum of every row); **run a second time it refuses**.
- The postgres role (not a superuser) ran all of it. On the disposable database that role needed a `grant` on the `supabase_migrations` schema; **on Supabase it should already have it. If step B stops with "permission denied", stop and report: do not grant anything on production without a fresh approval.**
- Real Supabase CLI dry run after step B, from this PR's tree (41 migration files): lists **exactly** `20261014001000` and `20261017001000`. See below.

## Phase 2 is NOT part of this and PR #54 is not in it
After Phase 1 (and a merge of #56), Phase 2 is `supabase db push --include-all`. **Run `supabase db push --include-all --dry-run` first. It must list exactly:**
```
20261014001000_google_reviews_history.sql
20261017001000_capture_live_only_woven_adoption_objects.sql
```
**If `20261019001000_woven_disable_terminated_apply.sql` (PR #54) or anything else appears, STOP: the wrong branch is checked out.** This PR's tree contains no `20261019001000` file; the combined #54 tree is the only one that lists it (verified with the same dry run against both trees).
Expected effect of Phase 2 on production: drops the leftover 4-argument `google_review_apply_reviews` overload (service_role-only; nothing calls it) and refreshes the body of `google_reviews_monthly`; the capture migration changes nothing (production already has those objects).

## Before step B
- Supabase, Database, Backups: confirm a recent backup or point-in-time recovery window exists. **STOP if none.**
- No one else is running migrations.
