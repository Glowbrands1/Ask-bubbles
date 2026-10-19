# Woven termination enforcement (DISABLE_TERMINATED) and rehire approval

Status: implemented on branch `claude/busy-ride-ajkjzk-termination`, **not merged, not deployed, not enabled anywhere**.

- Migration `20261019001000_woven_disable_terminated_apply.sql` is **NOT APPLIED** to any Supabase project. It was revised in place
  (after the first review round) because it is unapplied; a second migration would have left the first, weaker function callable.
- `WOVEN_TERMINATION_ENFORCEMENT` is **OFF by default**. Only the exact word `on` enables it; anything else is off and reported.
- `WOVEN_ACCESS_MODE` is unchanged: `off | shadow`, no apply value.

This is Ask Sunny's #89 adapted to Ask Bubbles (Buff City Soap / Midwest Soap Makers). Sunny's role names were not carried over;
Bubbles' roles are employee, assistant_manager, location_manager, district_manager, regional_manager, admin, owner, developer.

## 1. What existed before (review findings)

- The planner (`access/plan.ts`) already proposed `DISABLE_TERMINATED` (confirmed link, `managed_status`, not protected, Woven's own
  Terminated status read in the latest run). Nothing applied it; mass-change guards (`access/guards.ts`) gate every mutation.
- Links (`employee_account_links`, `20261002002000`): `woven_linked` / `not_woven_managed`, managed flags default off, `link_method`,
  `set_by`, `created_at`. `managed_*` can only be set at INSERT (service_role has SELECT, INSERT; no function updates them), so `set_by` and
  `created_at` are the record of who approved managed status and when. No new column was needed.
- Auth layer (`src/lib/auth/revocation.ts`): `revokeAuthAccess` (ban + session/refresh-token deletion), `restoreAuthAccess` (lift the ban).
  The manual admin path (`patchUser`) disables/re-enables with both layers, audited, with self-change and last-admin refusals (also a DB trigger).
- Tenant: `WOVEN_TENANT` / `PINNED_COMPANY_ID` = `55839f24-9241-418c-8405-37baf9a42a87` (Midwest Soap Makers); `company-scope.ts`;
  migration `20261012001000` pins the company on sync runs, directory rows and the location map.
- Terminated is Woven's `Status` integer resolving to exactly Terminated (`enums.ts`, `status-evidence.ts`); TerminationDate/Type alone never
  terminate (Active + past date is stored Active with `status_termination_conflict`).

## 2. The gates, in order (all must hold; each refusal is a short code and changes nothing)

1. **Switch** `WOVEN_TERMINATION_ENFORCEMENT=on` (default off; `termination-config.ts`). Optional `..._EMPLOYEE_IDS` batch list.
2. **Shadow mode** `WOVEN_ACCESS_MODE=shadow` (`shadow_mode_required` otherwise: nothing runs).
3. **Mass-change guards** on today's plan (stale/failed directory sync, active count drop, termination wave, mappings gone). Tripped = `aborted`.
4. **Protected accounts are review-only** (`terminate.ts`, planner `isTerminationProtected`, and the SQL function on its own): role override;
   admin / owner / developer; **district_manager and regional_manager**; and every user id in the app-switcher grant list
   (`src/lib/auth/app-switcher-users.ts`, which `app-switcher.ts` re-exports). The server passes the id list to the database
   (`p_protected_user_ids`), which refuses an empty/missing list (`disable_protected_ids_required`) and refuses protected ids
   (`disable_protected_account`). The planner shows `FLAG_PROTECTED_ACCOUNT`, so shadow runs never list them for review. A test keeps the TS and SQL
   role lists equal. The acting account is skipped too.
5. **Shadow review** (human gate). Enforcement acts only if the NEWEST shadow run is clean (completed, no tripped guard) and at most 48 hours old,
   an active administrator recorded a review of THAT run (not an older one), the reviewer is still an active admin, and the employee is on the
   review's approved list. No review / stale / guard-tripped / newer shadow run than the reviewed one / demoted reviewer = nothing is disabled and the
   response says why (`gate`). The tick runs enforcement BEFORE recording its own shadow run, so "the newest shadow run" is the one the administrator
   had the day to review; practically an administrator reviews each day's run before the next tick. Each review is one-shot by construction
   (the next shadow run supersedes it).
6. **Verified, person-approved link**: `link_method` admin_confirmed_email or admin_manual (never override_backfill, unmatched_backfill or
   provisioned), `managed_status` true, and `set_by` names a person (not blank, not `migration:%`). Never by name/email.
7. **Tenant**: the company stated by the server, the directory row's company and the latest sync run's company must all be the pinned id
   (disable, rehire and review paths each; `*_company_scope`, `disable_directory_not_current`).
8. **Terminated in the latest successful read** (not stale/unknown/missing).
9. The database also re-checks everything under row locks. Exempt from gate 5 only: COMPLETING a revocation already started (account already disabled and stamped
   terminated), which only tightens access; it still passes 3, 6, 7, 8 and protection.

### Attempted is not completed
A run is `completed` only when no attempted account failed; otherwise `partial` (some applied) or `failed` (none). The run row (`employee_access_runs.status`),
the per-account `employee_access_actions` rows (`result` and `result_code`) and the cron response (`terminationEnforcement.status`, `incompleteAccounts`) say
so, and the cron answers **HTTP 500** for partial/failed so the invocation is not shown as a success. The database refuses to record a `completed` run that
contains a failed account. A disabled account whose ban/sessions/stamp failed has no `access_revoked_at`, so the planner proposes it again next run and the
completion path finishes it (no new review needed). The database function never reports success for an unfinished revocation: only `record_revocation(ok)`
stamps `access_revoked_at`.

## 3. Rehire: only an administrator, explicitly, with a reason

**Enforcement never restores access.** No cron, enforcement, shadow, sync or planner code imports the rehire module or names `restoreAuthAccess`
(`termination-guarantees.test.ts` and `terminate.test.ts` enforce it). When Woven shows a revoked employee Active, the planner only flags
`FLAG_REHIRE_REVIEW`.

**Route:** `POST /api/admin/employees/woven/rehire` with `{ appUserId, externalEmployeeId, reason }`.
Administrator-only (admin/owner/developer console role, plus `manage_users` and `manage_integrations`), same-origin guard (`src/lib/api/same-origin.ts`),
rate-limited, actor = the verified session (`identity.subject`), never the body. The database (`employee_access_approve_rehire`) requires an ACTIVE
admin/owner/developer approver who is not the account, a non-empty reason (1-300), the pinned company on the directory row and the latest run, a confirmed link whose
account enforcement revoked, Woven's latest successful read showing the employee Active (and not Active-with-past-TerminationDate: `rehire_status_conflict`).
Two phases, retryable: (1) enable the profile and audit `status_changed` + `woven_rehire_approved` naming the approver and reason; (2) lift the Auth ban
(`restoreAuthAccess`), then `employee_access_record_rehire(ok)` clears `access_revoked_at` and audits `access_restored`. If the ban cannot be lifted the profile is put
BACK to disabled (`access_revocation_incomplete` audited) and the route answers **502 `incomplete`**; a crash between phases resumes; a repeat of a completed rehire is
`already_rehired`. Success is reported only when both phases completed.

**Manual re-enable through User Management (`patchUser`) of an account enforcement disabled is REFUSED** (409 `rehire_approval_required`, pointing to the approval route),
failing closed if the link cannot be read. Chosen over logging it as a rehire because that endpoint has no reason field and no Woven check, so it could not be a
real approval. Accounts that were not disabled by enforcement are unaffected.

**Runbook:** (1) confirm the person is Active in Woven after the next directory sync; (2) an administrator POSTs the rehire with a reason; (3) on `incomplete`, read the code
(`unban_failed_reverted`, `rehire_not_recorded`, ...) and POST again; (4) check `app_user_audit` for `woven_rehire_approved` + `access_restored`.

### Shadow review route
`GET /api/admin/employees/woven/termination-review` shows the newest shadow run, the gate state and the EmployeeIDs it planned to disable (ids only).
`POST` `{ shadowRunId, employeeIds, reason }` records the review (administrator-only, same-origin, rate-limited, reviewer = session); the server adds the sha256 of the sorted
id list, the database re-checks the reviewer is an active admin, the run is the newest/clean/fresh, every id was planned by it, and the pinned company.
Table `employee_access_shadow_reviews`: append-only, RLS forced, service_role SELECT/INSERT only.

## 4. What remains unapplied / off
- Migration `20261019001000` is not applied anywhere. Apply only with approval, verbatim, in one transaction, after the code is deployed with the switch unset.
- `WOVEN_TERMINATION_ENFORCEMENT` is unset by default; `WOVEN_ACCESS_MODE` must be `shadow` for it to do anything.
- Operating order: deploy -> apply migration -> shadow runs accumulate -> administrator reviews a clean run -> set the switch (optionally with the batch list) -> turn it
  back to unset/off to stop. Nothing is undone automatically; rehire is the explicit path back.

## 5. Decisions and limits worth knowing
- A review expires with the next shadow run, so a day's retry of a genuinely failed disable that never started (refused before the profile changed) needs a fresh review;
  one that already disabled the profile completes without it.
- An account an administrator disabled by hand that Woven also calls Terminated is not "started" by enforcement: it needs a reviewed approval before the link is stamped; until then it
  appears as a refused (failed) attempt each tick.
- No admin UI was added (optional): the two routes are the only paths. Follow-ups: a screen on the Access Preview for the gate state, the review and the rehire;
  the Access Preview copy still says plans are "never applied".
- The local-stack tests (real Auth) were not extended; the database half is executed on a throwaway Postgres by `supabase/tests/woven_disable_terminated_checks.sql`
  through `bash scripts/db/verify-migrations.sh`.

## 6. Production parity: live-only objects (found by a read-only comparison of the live DB with the repo migrations)

The LIVE Ask Bubbles database has objects that no repo migration creates (applied by hand, CRLF line endings, not in its migration history):

1. **trigger `employee_account_links_guard_update`** (BEFORE UPDATE on `employee_account_links`) and
2. **function `public.employee_account_links_guard_update()`** (plpgsql, not security definer, `search_path ''`, executable by PUBLIC), which allows ONLY
   `managed_status`, `managed_location`, `managed_role` and `updated_at` to change.
3. **function `public.auth_clear_user_credentials(uuid)`** (security definer, service_role-only). **Live-only; no repo code uses it; nothing here uses or
   depends on it, and it was deliberately not reproduced.**

**Why it mattered.** Triggers fire inside SECURITY DEFINER functions, so on the live database the migration's functions (which stamp `terminated_at`, `reactivated_at`,
`access_revoked_at`, `revoked_woven_status`, `last_synced_at`) were refused with `check_violation`, while every test passed against a database built only from the repo.
**Reproduced** (before the fix) with the fixture present: `rls_checks.sql` failed (`anon may execute employee_account_links_guard_update()`, the live function is PUBLIC-executable) and
`woven_disable_terminated_checks.sql` failed on the first stamp (`employee_account_links: only managed_status, managed_location and managed_role can change`).

**Fix, inside the (still unapplied) migration.** It now takes the guard over: `create or replace function` + `drop trigger if exists` + `create trigger`, so the end state is identical whether or not
the live copy exists. Allowed to change: the three flags, `updated_at`, and the five lifecycle stamps. Refused: the link's identity (`app_user_id`, `source_system`, `management`,
`external_employee_id`, `link_method`, `provisioned_by_source`, `first_provisioned_at`, `reason`, `set_by`, `created_at`). It stays a plain (invoker) trigger function with the search_path pinned (it reads only
OLD/NEW, so SECURITY DEFINER would add nothing) and its EXECUTE is revoked from everyone (a trigger function is not an API). service_role still holds no UPDATE on the table: the guard is the second lock.
**Applying this migration therefore also changes a live-only object's body and grants** (and puts it under version control) — review it as such.

**Test fixture.** `supabase/tests/fixtures/production_parity_links_guard.sql` reproduces exactly the live function and trigger. `scripts/db/verify-migrations.sh` and `scripts/local-stack/up.sh` apply it right after
`20261002002000_woven_account_links.sql` (before the migration under test, as in production); `VERIFY_PARITY=0` / `LOCAL_STACK_PARITY=0` build without it. The checks pass in both builds. Do not apply the fixture to a real project.
