# Migration version collisions in open PRs #26 and #36 (for separate correction)

**Documentation only. Neither PR was edited, commented on or touched.** Both are older than the current `main` and each reuses a migration version that `main` already uses for a different file.
A version is the migration's identity in `supabase_migrations.schema_migrations`; two files with one version cannot both be recorded, and the CLI treats the second as already applied or fails.

| PR | Its migration file | Version already used on `main` by | Live database today (read-only check, 2026-10-19) |
|---|---|---|---|
| [#26](https://github.com/Glowbrands1/Ask-bubbles/pull/26) (Woven Auto Sync switch; from the fork `paulyne-hue/Ask-bubbles`) | `supabase/migrations/20261014001000_woven_auto_sync_setting.sql` (+ `supabase/rollbacks/20261014001000_woven_auto_sync_setting_down.sql`) | `20261014001000_google_reviews_history.sql` | `public.employee_sync_settings` does **not** exist; history has 37 rows, newest `20261014114127` |
| [#36](https://github.com/Glowbrands1/Ask-bubbles/pull/36) (Google Reviews reply drafting) | `supabase/migrations/20261016001000_google_review_replies.sql` (+ `supabase/rollbacks/20261016001000_google_review_replies_down.sql`) | `20261016001000_google_review_reporting_cutoff.sql` | `public.google_review_replies` does **not** exist |

Neither PR's objects exist in production, so nothing has been applied by hand and there is no data to reconcile; only the file names and versions need to change.

## Suggested correction (for the PR authors; not done)
1. Rebase or merge each PR onto the current `main`.
2. Rename each migration **and its rollback** to a version that sorts **after everything already on `main` and after #54's `20261019001000`**, for example `20261020001000_woven_auto_sync_setting.sql` for #26 and `20261021001000_google_review_replies.sql` for #36. (Pick the final numbers when they are about to merge: the rule is "newer than every applied or pending version".)
3. Update anything that names the old file: the rollback file's header, the PR description's "Apply migration ..." step, and any test that reads the migration by name.
4. Re-run `npm run verify:migrations` on the renamed set, and a `supabase db push --dry-run` against a disposable copy; it must list only that PR's file.
5. #36 states it "requires the Google Reviews migrations already in production": after Phase 2 they are (including `20261016001000_google_review_reporting_cutoff`).

## Why this matters for the rollout
The Phase 2 dry run must list exactly two files. If either of these PRs merged first with its current version, the dry run would list a different set (or the CLI would refuse), and the reconciliation would have to be re-validated. **Do not merge #26 or #36 until they are renumbered.**
Also seen: #12's `20261009001000_analytics_business_timezone.sql` does not collide with a file on `main`; confirm its version against the live history before it merges.
