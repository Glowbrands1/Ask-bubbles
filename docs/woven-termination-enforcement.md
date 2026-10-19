# Woven termination enforcement (DISABLE_TERMINATED)

Status: implemented on branch `claude/busy-ride-ajkjzk-termination`, **not merged, not deployed**.
Migration `20261019001000_woven_disable_terminated_apply.sql` is **NOT APPLIED** to any Supabase project.
The switch `WOVEN_TERMINATION_ENFORCEMENT` is **off by default**; nothing changes until a person sets it to `on`.

This is Ask Sunny's #89, adapted to Ask Bubbles (Buff City Soap / Midwest Soap Makers). Sunny's role names
(Salon Director, ASD, SD, DM, RM) were not carried over; Bubbles' own roles are used.

## 1. Review: what Ask Bubbles did before this change

### Account lifecycle today
- `WOVEN_ACCESS_MODE` is `off | shadow`. There is **no apply value**; anything else is reported and treated as off
  (`access/config.ts`). Shadow records plans only (`access/shadow.ts` -> `employee_access_record_shadow_run`).
- The planner (`access/plan.ts`) already **proposes** `DISABLE_TERMINATED`, and only when: the employee is linked by a
  confirmed EmployeeID link, Woven's own `Terminated` status was read in the latest run (`status-evidence.ts`,
  `observedStatus`), the link has `managed_status = true`, and the account is not protected (role override, or
  role admin / owner / developer = `ADMIN_CONSOLE_ROLES`). Missing / unknown status is review only. A linked account
  already disabled with `access_revoked_at` yields no action (idempotent). An Active employee on a revoked link is
  `FLAG_REHIRE_REVIEW`, never re-enabled.
- Mass-change guards (`access/guards.ts`): stale or failed directory sync, enum unresolved, terminated read failed, active
  count drop under 80%, zero active, terminations over max(3, 5% of managed active linked accounts), mappings vanished.
  One tripped guard blocks all mutations (previously: recorded `aborted` in shadow).
- Links (`employee_account_links`, migration `20261002002000`): `woven_linked` / `not_woven_managed`, three managed flags
  default OFF, `link_method` in override_backfill / unmatched_backfill / admin_confirmed_email / admin_manual / provisioned.
  Only `link-store.ts` writes (insert of a person's link review, `link-review.ts`: exact single email match + explicit
  "same person" tick; status flag refused for admin roles). service_role has SELECT/INSERT only on links/runs/actions.
- Auth layer (`src/lib/auth/revocation.ts`, migration `20261002001000`): `revokeAuthAccess` = permanent ban + `auth_revoke_user_sessions`
  (deletes refresh tokens + sessions); idempotent, both steps attempted; `restoreAuthAccess` lifts the ban. An access token
  already issued stays valid up to the JWT expiry (default 1 h) but the app re-reads the profile on every request and RLS
  requires an active profile, so a disabled account is refused immediately.
- Manual admin path (`src/lib/admin/user-directory.ts` `patchUser`): profile first, then `revokeAuthAccess` / `restoreAuthAccess`,
  audited (`status_changed`, `access_revoked`, `access_revocation_incomplete`, `access_restored`). Refuses self-change and
  the last active administrator (also a DB trigger `app_users_keep_one_admin`, for every path).
- Tenant: `WOVEN_TENANT` / `PINNED_COMPANY_ID` (`55839f24-9241-418c-8405-37baf9a42a87`, Midwest Soap Makers) is in code;
  `company-scope.ts` rejects any record naming another/no company; migration `20261012001000` makes
  `employee_sync_runs`, `employee_access_directory`, `woven_location_map` carry and CHECK that company.
  The planner's `employee_directory_view` does NOT expose `woven_company_id`, so the company re-proof for enforcement is done
  in the database function (see below).
- How "Terminated" is determined (`enums.ts`, `normalize.ts`, `status-evidence.ts`, `sync.ts`): only the `Status` integer resolving to the
  exact label Terminated; any read saying terminated wins over a stale Active read; TerminationDate/Type alone never terminate
  (the Active-with-past-date conflict is stored Active with a flag). Phase-one tests pin this.
- Roles (`src/lib/permissions/index.ts`): employee, assistant_manager, location_manager, district_manager, regional_manager,
  admin, owner, developer. `ADMIN_CONSOLE_ROLES` = admin, owner, developer. App switcher (`src/lib/auth/app-switcher.ts`):
  admins plus two named non-admins (a district_manager and a regional_manager by user id) - a disabled account never
  reaches it (identity requires an active profile); enforcement changes nothing about who is offered it.
- Existing doc debris noticed (not changed): `link-review.ts` comments still say "Location Director" (Sunny wording);
  `access-preview.tsx` says "never applied" (see Follow-ups).

### What Sunny does (reference; read-only)
Sunny's merged lifecycle (`src/lib/employees/woven/access/apply.ts`, migration `20261006002000_woven_account_lifecycle.sql`):
an `apply` mode + `WOVEN_ACCESS_APPLY_ACTIONS` capability list + optional EmployeeID batch allowlist; a run lock; plan -> guards
-> per-row apply -> every row recorded; `employee_access_disable_terminated` re-checks link, `managed_status`, protection,
directory currency and Terminated-in-latest-read under row locks, disables the profile + audits, then the server bans and
revokes sessions, then `employee_access_record_revocation` stamps `access_revoked_at`; partial failure is retried next run.
Sunny never re-enables automatically (rehire = review).

**Could not verify:** Sunny's branch `origin/claude/woven-disable-terminated`, its `20261007001000_woven_disable_terminated_apply.sql`
and commit `e946713` were not readable from this worktree (git access to the sibling checkout is blocked for this agent and its
working tree is on main). The design above follows Sunny's merged lifecycle code only. The "reversible re-enable per e946713" item is
therefore **not implemented** (see decisions).

## 2. What was implemented

All conditions must hold; otherwise the row is recorded `skipped`/`failed` and nothing changes.

| # | Condition | Where |
|---|-----------|-------|
| a | `WOVEN_TERMINATION_ENFORCEMENT=on` (exact word, case-insensitive). Unset/empty/off = off; any other value = off + reported problem. Optional `WOVEN_TERMINATION_ENFORCEMENT_EMPLOYEE_IDS` batch list (malformed = off). Independent of `WOVEN_ACCESS_MODE` (still no apply value). | `access/termination-config.ts` |
| b | Reached through a confirmed EmployeeID link (`woven_linked`, link_method admin_confirmed_email / admin_manual / provisioned, `managed_status`). Never by name/email. | `terminate.ts` + SQL `disable_not_linked`, `disable_link_not_confirmed`, `disable_status_not_managed` |
| c | Directory row, latest finished sync run and the server-stated company are all the pinned Midwest Soap Makers id. | SQL `disable_company_scope`, `directory_is_current`, `observed_status` |
| d | Never admin/owner/developer or role-override accounts (so the last active admin is unreachable; the `app_users_keep_one_admin` trigger is still the backstop), never the acting account, never an unlinked account. Existing mass-change guards still stop the run. | `terminate.ts` `skipReason`, SQL `disable_protected_account` |
| e | Idempotent (already-revoked = no action; half-finished = retried), audited: `app_user_audit` (`status_changed`, `access_revoked`, `access_revocation_incomplete`, actor `woven-termination:<requester>`, no actor user id), link stamps, and an `apply` row in `employee_access_runs` + one `employee_access_actions` row per DISABLE_TERMINATED outcome (result applied/failed/skipped + result_code). | SQL, `terminate.ts` |

Order per account: DB disable (re-checked) -> `revokeAuthAccess` (ban + sessions) -> `employee_access_record_revocation`.
Entry point: after a successful scheduled sync in `src/app/api/employees/woven/cron/route.ts` (via `access/termination-run.ts`, which is the only
access module allowed to name `revokeAuthAccess`). Shadow and the Access Preview are unchanged.

### Migration 20261019001000 (NOT APPLIED)
New file, later than `20261016001000`, idempotent. Changes: `employee_access_runs.mode` also allows `apply`; `employee_access_actions`
gains `result_code` and results `applied|failed|skipped`; helper predicates (owner-only); the three SECURITY DEFINER functions
(empty `search_path`, EXECUTE to `service_role` only). No table grants change (still SELECT/INSERT only). No new audit action.
Verify offline with `npm run verify:migrations` (needs local PostgreSQL 16), then apply only with approval.

### Operating it
1. Deploy code with the switch unset. 2. Review a shadow run / the Access Preview for expected `DISABLE_TERMINATED` rows.
3. Apply the migration with approval. 4. Set `WOVEN_TERMINATION_ENFORCEMENT=on` and, for a first batch,
`WOVEN_TERMINATION_ENFORCEMENT_EMPLOYEE_IDS`. 5. Turn it back to unset/off to stop; nothing is undone automatically.

## 3. Decisions needing human approval
1. **Re-enable.** Not automated. A rehire stays `FLAG_REHIRE_REVIEW`; an admin re-enables in User Management (`patchUser` lifts the ban
   and audits `access_restored`). That path does not clear the link's `access_revoked_at`/`terminated_at`, so a manually re-enabled
   account that is Active in Woven keeps showing a rehire review, and one still Terminated in Woven would be re-disabled on the next run.
   Decide whether to add a recorded, explicit re-enable function (Sunny e946713 could not be read).
2. **Which roles.** District and regional managers, and the two app-switcher users, are not protected and can be disabled when
   linked + status-managed. Say if district_manager/regional_manager should be review-only.
3. **Switch is independent of `WOVEN_ACCESS_MODE`.** Alternative: also require shadow mode.
4. **Company check lives in the database function**, because the planner's directory view has no company column.
5. The `managed_status` flag is opt-in per link at link review; no existing link has it unless a person ticked it.
6. Defaults carried from the reference platform (`WOVEN_AUTO_PROVISION_ROLES` etc.) are still unconfirmed by Buff City Soap.

## 4. Tests
`access/terminate.test.ts`, `access/termination-config.test.ts`, and a deliberately extended `phase-one-guarantees.test.ts`
(section 9; sections 1-8 only gain: three RPC names allowed, `revokeAuthAccess` allowed in one wiring file). See the PR/commit message for results.

## 5. Follow-ups (not done)
- Access Preview copy says plans are "never applied"; show the switch state when it is on (touches a DOM test).
- No admin-triggered (manual) run exists; `actingUserId` support is in place for one.
- The `local-stack` tests (real Postgres + Auth) were not extended or run here.
