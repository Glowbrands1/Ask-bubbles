-- ============================================================================
-- WOVEN → ASK BUBBLES: DISABLE_TERMINATED, REVIEWED, AND REHIRE — the database half
-- ============================================================================
--
-- NOT APPLIED. Written for review; apply only with approval, verbatim, in one
-- transaction, and only after the app code that calls it is deployed with
-- WOVEN_TERMINATION_ENFORCEMENT unset (the default: off). It was revised in
-- place after the first review round precisely BECAUSE it is unapplied: a
-- second migration would have left the first, less strict disable function
-- callable by service_role.
--
-- WHAT THIS ADDS
--
--   A. employee_access_disable_terminated   disables ONE terminated employee's
--                                           account — only after a person
--                                           reviewed the shadow run it comes from.
--   B. employee_access_record_revocation    after the server banned the auth user
--                                           and revoked its sessions: stamps the
--                                           link's access_revoked_at; audits.
--   C. employee_access_record_shadow_review an ADMINISTRATOR records "I reviewed
--                                           THIS shadow run and approve THESE
--                                           EmployeeIDs" (the list and its hash).
--   D. employee_access_review_state         the gate: is there a clean, fresh,
--                                           reviewed shadow run right now?
--   E. employee_access_approve_rehire       an ADMINISTRATOR, with a written
--                                           reason, re-enables a revoked account
--                                           that Woven now shows Active.
--      employee_access_record_rehire        records the outcome of the server's
--                                           ban lift (or reverts, if it failed).
--   F. employee_access_record_apply_run     records one apply run and its outcomes.
--
-- THE GATES OF A (each a short error code; a refusal changes nothing):
--
--   disable_company_scope           the company stated by the server, the company
--                                   on the EmployeeID's directory row and on the
--                                   latest directory sync run are not ALL the
--                                   pinned Midwest Soap Makers id
--                                   (55839f24-9241-418c-8405-37baf9a42a87).
--   disable_protected_ids_required  the server did not pass its protected
--                                   user-id list (the app-switcher grant list).
--   disable_not_linked              no link row, not woven_linked, or the link
--                                   names another EmployeeID. Never name/email.
--   disable_link_not_confirmed      link_method is not admin_confirmed_email or
--                                   admin_manual. override_backfill,
--                                   unmatched_backfill and provisioned are not.
--   disable_link_not_approved       the link row does not record a person as
--                                   its approver (set_by blank or 'migration:%').
--   disable_status_not_managed      managed_status is off.
--   disable_protected_account       a role override; role admin / owner /
--                                   developer / district_manager /
--                                   regional_manager; or an id in the protected
--                                   list. Review-only. The last active
--                                   administrator is therefore unreachable;
--                                   app_users_keep_one_admin stays the backstop.
--   disable_directory_not_current   the latest finished directory sync failed
--                                   or is not a pinned-company run.
--   disable_not_terminated_in_latest_read
--                                   Woven's status for this EmployeeID, read in
--                                   the latest run, is not Terminated.
--   disable_review_<code>           the shadow-review gate (D) is not open, or
--                                   the review is not the one named, or
--   disable_not_in_reviewed_list    this EmployeeID is not on the approved list.
--                                   (Exempt: COMPLETING a revocation that was
--                                   already started — the account is already
--                                   disabled and stamped terminated; finishing
--                                   the ban only tightens access.)
--
-- THE SHADOW-REVIEW GATE (D) — enforcement may act only when ALL hold:
--   * the NEWEST shadow run (employee_access_runs, mode shadow) completed with
--     no tripped mass-change guard  (review_gate: shadow_run_guard_tripped)
--   * it is at most 48 hours old                       (shadow_run_stale)
--   * an active administrator recorded a review of THAT run — not an older one;
--     a newer shadow run than the reviewed one reopens the gate
--                                          (no_review / review_outdated / reviewer_not_admin)
--   * the employee is on that review's approved list.
--   The scheduled tick runs enforcement BEFORE it records its own shadow run, so
--   "the newest shadow run" is the one the administrator had the day to review.
--
-- THE REHIRE GATES (E), codes rehire_*: the approver is an ACTIVE
-- admin/owner/developer and not the account itself; a non-empty written reason
-- (1-300 characters); company proof exactly as above (rehire_company_scope); a
-- confirmed link whose account was revoked by enforcement (terminated_at set,
-- access_revoked_at set); Woven's latest successful read shows the employee
-- Active (rehire_not_active_in_latest_read), without the Active-with-a-past-
-- TerminationDate conflict (rehire_status_conflict). Nothing here re-enables
-- anybody automatically: only an administrator's call reaches E.
--   Two phases, retryable: approve_rehire enables the profile (audit:
--   status_changed and woven_rehire_approved naming the approver and reason);
--   the server then lifts the Auth ban; record_rehire(ok) clears
--   access_revoked_at and audits access_restored. If the ban could not be
--   lifted, record_rehire(not ok) puts the profile BACK to disabled and audits
--   access_revocation_incomplete, so the two layers never disagree and a retry
--   starts clean. A retry after a crash between the phases resumes.
--
-- WHO APPROVED MANAGED STATUS. employee_account_links.managed_status can only
-- be set at INSERT (service_role holds SELECT, INSERT on the table, and no
-- function anywhere updates a managed_* column), and the insert records
-- set_by (the reviewing person) and created_at. So the existing columns prove
-- who and when; disable_link_not_approved refuses a link whose set_by is blank
-- or a migration.
--
-- NOT HERE, ON PURPOSE: automatic re-enabling, role or location changes,
-- account creation, invitations, deleting anything. `auth.users` is never read
-- or written by this file; the Auth ban/unban and session revocation are the
-- server's half (src/lib/auth/revocation.ts).
--
-- AUDIT. app_user_audit gains ONE action, woven_rehire_approved (all ten
-- existing actions kept). Rows written here carry actor_email
-- 'woven-termination:<requester>' (no actor id) for enforcement, and the
-- approving administrator's id and email for a rehire.
--
-- PRIVILEGES: service_role keeps SELECT, INSERT only on the tables (the new
-- review table too: append-only trigger, RLS forced, no policies). Every write
-- to app_users and links goes through a SECURITY DEFINER function with an empty
-- search_path, EXECUTE to service_role only; the predicates are owner-only.
--
-- Idempotent: constraints dropped and re-added, functions create-or-replace,
-- columns add-if-not-exists, the table create-if-not-exists.

-- ------------------------------------------ 1. the run record: apply runs ---

alter table public.employee_access_runs drop constraint if exists employee_access_runs_mode_check;
alter table public.employee_access_runs add constraint employee_access_runs_mode_check
  check (mode in ('shadow', 'apply'));

/* An apply run that did not complete every attempted account is `partial` (some applied) or `failed` (none). */
alter table public.employee_access_runs drop constraint if exists employee_access_runs_status_check;
alter table public.employee_access_runs add constraint employee_access_runs_status_check
  check (status in ('completed', 'aborted', 'partial', 'failed'));

alter table public.employee_access_actions add column if not exists result_code text;
alter table public.employee_access_actions drop constraint if exists employee_access_actions_result_code_check;
alter table public.employee_access_actions add constraint employee_access_actions_result_code_check
  check (result_code is null or result_code ~ '^[a-z0-9_.:-]{1,80}$');

alter table public.employee_access_actions drop constraint if exists employee_access_actions_result_check;
alter table public.employee_access_actions add constraint employee_access_actions_result_check
  check (result in (
    'shadow',   -- shadow run: calculated, recorded, not applied
    'applied',  -- apply run: the account was disabled and its auth access revoked
    'failed',   -- apply run: attempted, did not complete; result_code says where
    'skipped'   -- apply run: a DISABLE_TERMINATED that was NOT attempted (gate, protection, batch)
  ));

-- ------------------------------------------------- 2. the audit vocabulary ---
-- ADDITIVE ONLY: every earlier value stays (src/test/audit-actions.ts reads this).

alter table public.app_user_audit drop constraint if exists app_user_audit_action_check;
alter table public.app_user_audit add constraint app_user_audit_action_check
  check (action in (
    'invited',
    'invite_resent',
    'invitation_accepted',
    'reset_requested',
    'role_changed',
    'status_changed',
    'scope_changed',
    'access_revoked',
    'access_restored',
    'access_revocation_incomplete',
    'woven_rehire_approved'
  ));

-- --------------------------------------------- 3. the administrator's review ---

create table if not exists public.employee_access_shadow_reviews (
  id                  uuid primary key default extensions.gen_random_uuid(),
  shadow_run_id       uuid not null references public.employee_access_runs (id) on delete restrict,
  reviewed_by         uuid not null,
  reviewed_by_email   text not null check (length(btrim(reviewed_by_email)) between 1 and 254),
  approved_employee_ids text[] not null check (cardinality(approved_employee_ids) >= 1),
  approved_ids_sha256 text not null check (approved_ids_sha256 ~ '^[0-9a-f]{64}$'),
  reason              text not null check (length(btrim(reason)) between 1 and 300),
  created_at          timestamptz not null default now()
);

create index if not exists employee_access_shadow_reviews_by_run
  on public.employee_access_shadow_reviews (shadow_run_id, created_at desc);

comment on table public.employee_access_shadow_reviews is
  'Append-only. An administrator''s review of ONE shadow run: the exact EmployeeIDs approved for termination enforcement (and their hash). Enforcement acts only on a clean, fresh run that has a review, for employees on its list.';

drop trigger if exists employee_access_shadow_reviews_append_only on public.employee_access_shadow_reviews;
create trigger employee_access_shadow_reviews_append_only
  before update or delete on public.employee_access_shadow_reviews
  for each row execute function public.employee_access_actions_guard();

alter table public.employee_access_shadow_reviews enable row level security;
alter table public.employee_access_shadow_reviews force row level security;
revoke all on public.employee_access_shadow_reviews from public, anon, authenticated, service_role;
grant select, insert on public.employee_access_shadow_reviews to service_role;

-- ------------------------------------------------------ 4. shared predicates ---

/* The latest FINISHED directory sync succeeded, and was a pinned-company run. */
create or replace function public.employee_access_directory_is_current()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select r.status::text = 'succeeded'
       and r.woven_company_id = '55839f24-9241-418c-8405-37baf9a42a87'::uuid
    from public.employee_sync_runs r
    where r.status::text <> 'running'
    order by r.started_at desc
    limit 1
  ), false);
$$;

/* Woven's status for one employee AS WE MAY ACT ON IT: only when read in the latest run, else unknown. */
create or replace function public.employee_access_observed_status(p_external_employee_id text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select case when d.missing_sync_count > 0 then 'unknown' else d.employment_status::text end
    from public.employee_access_directory d
    where d.source_system = 'woven'
      and d.external_employee_id = p_external_employee_id
      and d.woven_company_id = '55839f24-9241-418c-8405-37baf9a42a87'::uuid
  ), 'not_found');
$$;

/*
 * Termination-protected: a role override; role admin / owner / developer /
 * district_manager / regional_manager; or an id in the list the SERVER passes
 * (the app-switcher grant list). Mirrors isTerminationProtected() in
 * src/lib/employees/woven/access/plan.ts; a test keeps the role lists equal.
 */
create or replace function public.employee_access_is_protected(p_app_user_id uuid, p_protected_user_ids uuid[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.employee_role_overrides o where o.app_user_id = p_app_user_id)
      or exists (select 1 from public.app_users u
                  where u.id = p_app_user_id
                    and u.role::text in ('admin', 'owner', 'developer', 'district_manager', 'regional_manager'))
      or p_app_user_id = any (coalesce(p_protected_user_ids, '{}'::uuid[]));
$$;

/* An ACTIVE administrator: role admin / owner / developer (ADMIN_CONSOLE_ROLES) and status active. */
create or replace function public.employee_access_is_active_admin(p_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.app_users u
                  where u.id = p_user_id and u.status::text = 'active' and u.role::text in ('admin', 'owner', 'developer'));
$$;

/* sha256 (hex) of the sorted, de-duplicated EmployeeIDs joined by newlines. The server computes the same. */
create or replace function public.employee_access_ids_hash(p_ids text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(coalesce(array_to_string(array(select d.x from (select distinct x from unnest(p_ids) x) d order by d.x collate "C"), E'\n'), ''), 'UTF8')), 'hex');
$$;

-- ------------------------------------------- 4b. the link-update guard (repo-managed) ---
--
-- PRODUCTION PARITY. The LIVE database already has a trigger of this name on
-- employee_account_links, applied by hand and in no migration, whose function
-- allows ONLY the three managed_* flags and updated_at to change. Triggers fire
-- inside SECURITY DEFINER functions too, so against that database the
-- stamps below (terminated_at, reactivated_at, access_revoked_at,
-- revoked_woven_status, last_synced_at) would be refused with check_violation.
-- So this migration takes the guard over: create-or-replace the function and
-- re-create the trigger, so that WHETHER OR NOT the live one exists the end state
-- is the same, and is in the repository:
--
--   may change   managed_status, managed_location, managed_role, updated_at,
--                and the lifecycle stamps this file's functions write
--   never change a link's identity: app_user_id, source_system, management,
--                external_employee_id, link_method, provisioned_by_source,
--                first_provisioned_at, reason, set_by, created_at
--
-- It stays a plain (invoker) trigger function with the search_path pinned: it
-- reads only the OLD and NEW rows (to_jsonb), touches no table, and needs no
-- privilege, so there is nothing for SECURITY DEFINER to add. Its EXECUTE is
-- revoked from every role (a trigger function is not an API; the live one was
-- executable by PUBLIC). service_role still holds no UPDATE on the table, so
-- the guard is the second lock behind the missing grant.

create or replace function public.employee_account_links_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_mutable constant text[] := array[
    'managed_status', 'managed_location', 'managed_role', 'updated_at',
    'terminated_at', 'reactivated_at', 'access_revoked_at', 'revoked_woven_status', 'last_synced_at'
  ];
begin
  if (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
    raise exception 'employee_account_links: only managed_status, managed_location and managed_role can change (and, through the termination functions, the termination and rehire record); a link''s identity never does'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.employee_account_links_guard_update() from public, anon, authenticated, service_role;

drop trigger if exists employee_account_links_guard_update on public.employee_account_links;
create trigger employee_account_links_guard_update
  before update on public.employee_account_links
  for each row execute function public.employee_account_links_guard_update();

-- --------------------------------------------- 5. the shadow-review gate (D) ---

create or replace function public.employee_access_review_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_run    record;
  v_review record;
begin
  select r.id, r.status, r.guard_codes, r.created_at into v_run
    from public.employee_access_runs r
   where r.mode = 'shadow'
   order by r.created_at desc, r.id desc
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_shadow_run');
  end if;
  if v_run.status <> 'completed' or cardinality(v_run.guard_codes) > 0 then
    return jsonb_build_object('ok', false, 'code', 'shadow_run_guard_tripped', 'shadow_run_id', v_run.id);
  end if;
  if v_run.created_at < now() - interval '48 hours' then
    return jsonb_build_object('ok', false, 'code', 'shadow_run_stale', 'shadow_run_id', v_run.id);
  end if;

  select v.id, v.reviewed_by, v.approved_employee_ids into v_review
    from public.employee_access_shadow_reviews v
   where v.shadow_run_id = v_run.id
   order by v.created_at desc, v.id desc
   limit 1;
  if not found then
    return jsonb_build_object(
      'ok', false,
      'code', case when exists (select 1 from public.employee_access_shadow_reviews) then 'review_outdated' else 'no_review' end,
      'shadow_run_id', v_run.id);
  end if;
  if not public.employee_access_is_active_admin(v_review.reviewed_by) then
    return jsonb_build_object('ok', false, 'code', 'reviewer_not_admin', 'shadow_run_id', v_run.id, 'review_id', v_review.id);
  end if;
  return jsonb_build_object(
    'ok', true, 'code', 'ok', 'shadow_run_id', v_run.id, 'review_id', v_review.id,
    'approved_employee_ids', to_jsonb(v_review.approved_employee_ids));
end;
$$;

comment on function public.employee_access_review_state() is
  'Server-only. Whether termination enforcement may act now: the newest shadow run is clean, fresh and reviewed by an active administrator. Returns {ok, code, shadow_run_id, review_id, approved_employee_ids}.';

create or replace function public.employee_access_record_shadow_review(
  p_shadow_run_id    uuid,
  p_reviewer         uuid,
  p_employee_ids     text[],
  p_ids_sha256       text,
  p_woven_company_id uuid,
  p_reason           text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pinned constant uuid := '55839f24-9241-418c-8405-37baf9a42a87';
  v_run    record;
  v_ids    text[];
  v_id     uuid;
  v_email  text;
begin
  if not public.employee_access_is_active_admin(p_reviewer) then
    raise exception 'review_reviewer_not_admin' using errcode = 'check_violation';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 300 then
    raise exception 'review_reason_required' using errcode = 'check_violation';
  end if;
  if p_woven_company_id is distinct from v_pinned or not public.employee_access_directory_is_current() then
    raise exception 'review_company_scope' using errcode = 'check_violation';
  end if;

  select r.id, r.mode, r.status, r.guard_codes, r.created_at into v_run
    from public.employee_access_runs r where r.id = p_shadow_run_id;
  if not found or v_run.mode <> 'shadow' then
    raise exception 'review_run_not_found' using errcode = 'no_data_found';
  end if;
  if v_run.id is distinct from (select r.id from public.employee_access_runs r where r.mode = 'shadow' order by r.created_at desc, r.id desc limit 1) then
    raise exception 'review_not_latest_run' using errcode = 'check_violation';
  end if;
  if v_run.status <> 'completed' or cardinality(v_run.guard_codes) > 0 then
    raise exception 'review_run_not_clean' using errcode = 'check_violation';
  end if;
  if v_run.created_at < now() - interval '48 hours' then
    raise exception 'review_run_stale' using errcode = 'check_violation';
  end if;

  v_ids := array(select d.x from (select distinct x from unnest(coalesce(p_employee_ids, '{}'::text[])) x) d order by d.x collate "C");
  if cardinality(v_ids) = 0 then
    raise exception 'review_no_employees' using errcode = 'check_violation';
  end if;
  if p_ids_sha256 is distinct from public.employee_access_ids_hash(v_ids) then
    raise exception 'review_hash_mismatch' using errcode = 'check_violation';
  end if;
  /* Every approved EmployeeID is a DISABLE_TERMINATED the reviewed run actually planned... */
  if exists (
    select 1 from unnest(v_ids) x
     where not exists (
       select 1 from public.employee_access_actions a
        where a.access_run_id = p_shadow_run_id and a.external_employee_id = x
          and a.action = 'DISABLE_TERMINATED' and a.is_primary)
  ) then
    raise exception 'review_unlisted_employee' using errcode = 'check_violation';
  end if;
  /* ...and a pinned-company directory row. */
  if exists (
    select 1 from unnest(v_ids) x
     where not exists (
       select 1 from public.employee_access_directory d
        where d.source_system = 'woven' and d.external_employee_id = x and d.woven_company_id = v_pinned)
  ) then
    raise exception 'review_company_scope' using errcode = 'check_violation';
  end if;

  select u.email into v_email from public.app_users u where u.id = p_reviewer;
  insert into public.employee_access_shadow_reviews
    (shadow_run_id, reviewed_by, reviewed_by_email, approved_employee_ids, approved_ids_sha256, reason)
  values (p_shadow_run_id, p_reviewer, v_email, v_ids, public.employee_access_ids_hash(v_ids), btrim(p_reason))
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.employee_access_record_shadow_review(uuid, uuid, text[], text, uuid, text) is
  'Server-only. An active administrator records a review of the NEWEST clean, fresh shadow run, approving an exact list of EmployeeIDs it planned to disable. Pinned-company proof; never changes an account.';

-- ------------------------------------------------------ 6. DISABLE_TERMINATED ---

create or replace function public.employee_access_disable_terminated(
  p_app_user_id          uuid,
  p_external_employee_id text,
  p_woven_company_id     uuid,
  p_review_id            uuid,
  p_protected_user_ids   uuid[],
  p_set_by               text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link     record;
  v_status   text;
  v_state    jsonb;
  v_started  boolean;
  v_pinned   constant uuid := '55839f24-9241-418c-8405-37baf9a42a87';
begin
  /* The company the server states, the directory row's company and the latest sync's company: all the pinned one. */
  if p_woven_company_id is distinct from v_pinned
     or not exists (
       select 1 from public.employee_access_directory d
       where d.source_system = 'woven' and d.external_employee_id = p_external_employee_id
         and d.woven_company_id = v_pinned
     ) then
    raise exception 'disable_company_scope' using errcode = 'check_violation';
  end if;
  if p_protected_user_ids is null or cardinality(p_protected_user_ids) = 0 then
    raise exception 'disable_protected_ids_required' using errcode = 'check_violation';
  end if;

  select * into v_link from public.employee_account_links where app_user_id = p_app_user_id for update;
  if not found or v_link.management <> 'woven_linked' or v_link.external_employee_id is distinct from p_external_employee_id then
    raise exception 'disable_not_linked' using errcode = 'check_violation';
  end if;
  /* A person confirmed this link. override_backfill, unmatched_backfill and provisioned are not that. */
  if v_link.link_method not in ('admin_confirmed_email', 'admin_manual') then
    raise exception 'disable_link_not_confirmed' using errcode = 'check_violation';
  end if;
  /* ...and the link records WHO approved it (managed_status is insert-only: set_by/created_at are the approval). */
  if v_link.set_by is null or length(btrim(v_link.set_by)) = 0 or v_link.set_by like 'migration:%' then
    raise exception 'disable_link_not_approved' using errcode = 'check_violation';
  end if;
  if not v_link.managed_status then
    raise exception 'disable_status_not_managed' using errcode = 'check_violation';
  end if;
  if public.employee_access_is_protected(p_app_user_id, p_protected_user_ids) then
    raise exception 'disable_protected_account' using errcode = 'check_violation';
  end if;

  if not public.employee_access_directory_is_current() then
    raise exception 'disable_directory_not_current' using errcode = 'check_violation';
  end if;
  if public.employee_access_observed_status(p_external_employee_id) <> 'terminated' then
    raise exception 'disable_not_terminated_in_latest_read' using errcode = 'check_violation';
  end if;

  select u.status::text into v_status from public.app_users u where u.id = p_app_user_id for update;
  if not found then
    raise exception 'disable_account_not_found' using errcode = 'no_data_found';
  end if;

  /* Finishing a revocation already started (disabled AND stamped terminated, not rehired) needs no new review. */
  v_started := v_status = 'disabled' and v_link.terminated_at is not null and v_link.reactivated_at is null;
  if not v_started then
    v_state := public.employee_access_review_state();
    if (v_state ->> 'ok')::boolean is not true or (v_state ->> 'review_id')::uuid is distinct from p_review_id then
      raise exception 'disable_review_%', coalesce(nullif(v_state ->> 'code', 'ok'), 'not_the_open_review') using errcode = 'check_violation';
    end if;
    if not (v_state -> 'approved_employee_ids') ? p_external_employee_id then
      raise exception 'disable_not_in_reviewed_list' using errcode = 'check_violation';
    end if;
  end if;

  if v_status <> 'disabled' then
    update public.app_users set status = 'disabled', updated_by = null where id = p_app_user_id;
    insert into public.app_user_audit (target_user_id, target_email, actor_user_id, actor_email, action, from_value, to_value)
    select p_app_user_id, u.email, null, left(p_set_by, 120), 'status_changed', v_status, 'disabled'
      from public.app_users u where u.id = p_app_user_id;
  end if;

  if not v_started then
    /* A new termination: it starts a new revocation record (a rehired-then-terminated-again account included). */
    update public.employee_account_links
       set terminated_at = now(),
           reactivated_at = null,
           revoked_woven_status = 'terminated',
           last_synced_at = now()
     where app_user_id = p_app_user_id;
  else
    update public.employee_account_links set last_synced_at = now() where app_user_id = p_app_user_id;
  end if;

  return case when v_status = 'disabled' then 'already_disabled' else 'disabled' end;
end;
$$;

comment on function public.employee_access_disable_terminated(uuid, text, uuid, uuid, uuid[], text) is
  'Server-only. Disables ONE account whose person-approved, status-managed, unprotected link names an EmployeeID that Woven (pinned company, latest successful sync) calls Terminated, listed on an administrator''s review of the newest clean shadow run. Re-verifies everything under row locks; refuses with a short code otherwise. Never enables, creates or deletes anything.';

/* After the Auth ban + session revocation: stamp the link, and audit either way. */
create or replace function public.employee_access_record_revocation(
  p_app_user_id uuid,
  p_ok          boolean,
  p_detail      text,
  p_set_by      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ok then
    update public.employee_account_links
       set access_revoked_at = coalesce(access_revoked_at, now()),
           revoked_woven_status = 'terminated'
     where app_user_id = p_app_user_id and terminated_at is not null and reactivated_at is null;
    if not found then
      raise exception 'record_revocation_not_terminated' using errcode = 'check_violation';
    end if;
  end if;
  insert into public.app_user_audit (target_user_id, target_email, actor_user_id, actor_email, action, from_value, to_value)
  select p_app_user_id, u.email, null, left(p_set_by, 120),
         case when p_ok then 'access_revoked' else 'access_revocation_incomplete' end,
         'woven:terminated', left(coalesce(p_detail, ''), 200)
    from public.app_users u where u.id = p_app_user_id;
end;
$$;

comment on function public.employee_access_record_revocation(uuid, boolean, text, text) is
  'Server-only. After the Auth ban and session revocation: stamps access_revoked_at on a terminated, not-rehired link (only when both steps succeeded) and audits access_revoked / access_revocation_incomplete.';

-- ------------------------------------------------------------ 7. REHIRE (E) ---

create or replace function public.employee_access_approve_rehire(
  p_app_user_id          uuid,
  p_external_employee_id text,
  p_woven_company_id     uuid,
  p_approver             uuid,
  p_reason               text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link     record;
  v_status   text;
  v_pinned   constant uuid := '55839f24-9241-418c-8405-37baf9a42a87';
begin
  if not public.employee_access_is_active_admin(p_approver) then
    raise exception 'rehire_approver_not_admin' using errcode = 'check_violation';
  end if;
  if p_approver = p_app_user_id then
    raise exception 'rehire_self_approval' using errcode = 'check_violation';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 300 then
    raise exception 'rehire_reason_required' using errcode = 'check_violation';
  end if;
  if p_woven_company_id is distinct from v_pinned
     or not exists (
       select 1 from public.employee_access_directory d
       where d.source_system = 'woven' and d.external_employee_id = p_external_employee_id
         and d.woven_company_id = v_pinned
     ) then
    raise exception 'rehire_company_scope' using errcode = 'check_violation';
  end if;

  select * into v_link from public.employee_account_links where app_user_id = p_app_user_id for update;
  if not found or v_link.management <> 'woven_linked' or v_link.external_employee_id is distinct from p_external_employee_id then
    raise exception 'rehire_not_linked' using errcode = 'check_violation';
  end if;
  if v_link.link_method not in ('admin_confirmed_email', 'admin_manual') then
    raise exception 'rehire_link_not_confirmed' using errcode = 'check_violation';
  end if;

  select u.status::text into v_status from public.app_users u where u.id = p_app_user_id for update;
  if not found then
    raise exception 'rehire_account_not_found' using errcode = 'no_data_found';
  end if;

  /* A rehire that is already complete: nothing to do (idempotent). */
  if v_link.terminated_at is not null and v_link.reactivated_at is not null and v_link.access_revoked_at is null and v_status = 'active' then
    return 'already_rehired';
  end if;
  /* Otherwise the account must have been revoked by enforcement and not yet rehired (or be resuming an interrupted rehire). */
  if v_link.terminated_at is null or (v_link.reactivated_at is null and (v_link.access_revoked_at is null or v_status <> 'disabled')) then
    raise exception 'rehire_not_revoked_by_enforcement' using errcode = 'check_violation';
  end if;

  if not public.employee_access_directory_is_current() then
    raise exception 'rehire_directory_not_current' using errcode = 'check_violation';
  end if;
  if public.employee_access_observed_status(p_external_employee_id) <> 'active' then
    raise exception 'rehire_not_active_in_latest_read' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.employee_access_directory d
     where d.source_system = 'woven' and d.external_employee_id = p_external_employee_id
       and 'status_termination_conflict' = any (d.data_issues)
  ) then
    raise exception 'rehire_status_conflict' using errcode = 'check_violation';
  end if;

  if v_status = 'disabled' then
    update public.app_users set status = 'active', updated_by = p_approver where id = p_app_user_id;
    update public.employee_account_links
       set reactivated_at = coalesce(reactivated_at, now()), last_synced_at = now()
     where app_user_id = p_app_user_id;
    insert into public.app_user_audit (target_user_id, target_email, actor_user_id, actor_email, action, from_value, to_value)
    select p_app_user_id, u.email, p_approver, a.email, 'status_changed', 'disabled', 'active'
      from public.app_users u, public.app_users a where u.id = p_app_user_id and a.id = p_approver;
    insert into public.app_user_audit (target_user_id, target_email, actor_user_id, actor_email, action, from_value, to_value)
    select p_app_user_id, u.email, p_approver, a.email, 'woven_rehire_approved', 'woven:terminated',
           left('active in Woven; reason: ' || btrim(p_reason), 200)
      from public.app_users u, public.app_users a where u.id = p_app_user_id and a.id = p_approver;
    return 'rehire_enabled';
  end if;
  /* Profile already active, revocation record not yet cleared: resume (the server lifts the ban, then records). */
  return 'rehire_pending_completion';
end;
$$;

comment on function public.employee_access_approve_rehire(uuid, text, uuid, uuid, text) is
  'Server-only. An ACTIVE administrator, with a written reason, re-enables an account enforcement revoked, when Woven (pinned company, latest successful read) shows the employee Active. Phase one of two: the server then lifts the Auth ban and calls employee_access_record_rehire. Never called by any automatic path.';

create or replace function public.employee_access_record_rehire(
  p_app_user_id uuid,
  p_approver    uuid,
  p_ok          boolean,
  p_detail      text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link   record;
  v_status text;
begin
  if not public.employee_access_is_active_admin(p_approver) then
    raise exception 'rehire_approver_not_admin' using errcode = 'check_violation';
  end if;
  select * into v_link from public.employee_account_links where app_user_id = p_app_user_id for update;
  select u.status::text into v_status from public.app_users u where u.id = p_app_user_id for update;
  if v_link is null or v_status is null or v_link.terminated_at is null or v_link.reactivated_at is null then
    raise exception 'record_rehire_not_pending' using errcode = 'check_violation';
  end if;

  if p_ok then
    if v_link.access_revoked_at is null then
      return 'already_recorded';
    end if;
    update public.employee_account_links set access_revoked_at = null where app_user_id = p_app_user_id;
    insert into public.app_user_audit (target_user_id, target_email, actor_user_id, actor_email, action, from_value, to_value)
    select p_app_user_id, u.email, p_approver, a.email, 'access_restored', 'woven:terminated', 'auth_ban_lifted'
      from public.app_users u, public.app_users a where u.id = p_app_user_id and a.id = p_approver;
    return 'recorded';
  end if;

  /* The ban was not lifted: put the profile BACK to disabled so the two layers agree; the approval can be retried. */
  if v_link.access_revoked_at is not null then
    if v_status = 'active' then
      update public.app_users set status = 'disabled', updated_by = p_approver where id = p_app_user_id;
    end if;
    update public.employee_account_links set reactivated_at = null where app_user_id = p_app_user_id;
  end if;
  insert into public.app_user_audit (target_user_id, target_email, actor_user_id, actor_email, action, from_value, to_value)
  select p_app_user_id, u.email, p_approver, a.email, 'access_revocation_incomplete', 'woven:rehire',
         left('failed:' || coalesce(p_detail, 'unban'), 200)
    from public.app_users u, public.app_users a where u.id = p_app_user_id and a.id = p_approver;
  return 'reverted';
end;
$$;

comment on function public.employee_access_record_rehire(uuid, uuid, boolean, text) is
  'Server-only. Phase two of a rehire: ok = the Auth ban was lifted (clears access_revoked_at, audits access_restored); not ok = it was not, so the profile goes back to disabled and the approval is retryable.';

-- ----------------------------------------------------- 8. the apply run record ---

create or replace function public.employee_access_record_apply_run(
  p_requested_by      text,
  p_directory_run_id  uuid,
  p_policy_version    text,
  p_status            text,
  p_guard_codes       text[],
  p_counts            jsonb,
  p_actions           jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
begin
  if p_status not in ('completed', 'partial', 'failed', 'aborted') then
    raise exception 'employee_access_record_apply_run: unknown status'
      using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_actions) is distinct from 'array' then
    raise exception 'employee_access_record_apply_run: actions must be a JSON array'
      using errcode = 'invalid_parameter_value';
  end if;
  /* An apply run records applied / failed / skipped DISABLE_TERMINATED rows only. */
  if exists (
    select 1 from jsonb_array_elements(p_actions) a
    where a ->> 'action' is distinct from 'DISABLE_TERMINATED'
       or a ->> 'result' not in ('applied', 'failed', 'skipped')
  ) then
    raise exception 'employee_access_record_apply_run: only DISABLE_TERMINATED outcomes are recorded'
      using errcode = 'check_violation';
  end if;
  /* A run is `completed` ONLY when no attempted account failed. Attempted is not completed. */
  if p_status = 'completed' and exists (select 1 from jsonb_array_elements(p_actions) a where a ->> 'result' = 'failed') then
    raise exception 'employee_access_record_apply_run: a run with a failed account is not completed'
      using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('employee_access_record_apply_run'));

  insert into public.employee_access_runs (mode, requested_by, directory_run_id, policy_version, status, guard_codes, counts)
  values (
    'apply', p_requested_by, p_directory_run_id, p_policy_version, p_status,
    case when p_status = 'aborted' then coalesce(p_guard_codes, '{}') else '{}' end,
    coalesce(p_counts, '{}'::jsonb)
  )
  returning id into v_run;

  insert into public.employee_access_actions (
    access_run_id, external_employee_id, app_user_id, action, is_primary, reason_codes,
    before_values, after_values, woven_source_at, result, result_code
  )
  select
    v_run,
    a ->> 'external_employee_id',
    nullif(a ->> 'app_user_id', '')::uuid,
    a ->> 'action',
    coalesce((a ->> 'is_primary')::boolean, false),
    coalesce(array(select jsonb_array_elements_text(a -> 'reason_codes')), '{}'),
    a -> 'before_values',
    a -> 'after_values',
    nullif(a ->> 'woven_source_at', '')::timestamptz,
    a ->> 'result',
    nullif(a ->> 'result_code', '')
  from jsonb_array_elements(p_actions) as a;

  return v_run;
end;
$$;

comment on function public.employee_access_record_apply_run(text, uuid, text, text, text[], jsonb, jsonb) is
  'Server-only. Records one APPLY run (termination enforcement) and its DISABLE_TERMINATED outcomes in one transaction; status is completed only when no attempted account failed (else partial/failed), aborted only with a tripped guard.';

-- ---------------------------------------------------------- 9. privileges ---
--
-- Nothing inherited. Every function: ALL revoked from everyone including
-- service_role, then EXECUTE granted to service_role for the entry points only.
-- The predicates stay owner-only (called from inside the definer functions).

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.employee_access_directory_is_current()',
    'public.employee_access_observed_status(text)',
    'public.employee_access_is_protected(uuid, uuid[])',
    'public.employee_access_is_active_admin(uuid)',
    'public.employee_access_ids_hash(text[])',
    'public.employee_access_review_state()',
    'public.employee_access_record_shadow_review(uuid, uuid, text[], text, uuid, text)',
    'public.employee_access_disable_terminated(uuid, text, uuid, uuid, uuid[], text)',
    'public.employee_access_record_revocation(uuid, boolean, text, text)',
    'public.employee_access_approve_rehire(uuid, text, uuid, uuid, text)',
    'public.employee_access_record_rehire(uuid, uuid, boolean, text)',
    'public.employee_access_record_apply_run(text, uuid, text, text, text[], jsonb, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_fn);
  end loop;
end;
$$;

grant execute on function public.employee_access_review_state() to service_role;
grant execute on function public.employee_access_record_shadow_review(uuid, uuid, text[], text, uuid, text) to service_role;
grant execute on function public.employee_access_disable_terminated(uuid, text, uuid, uuid, uuid[], text) to service_role;
grant execute on function public.employee_access_record_revocation(uuid, boolean, text, text) to service_role;
grant execute on function public.employee_access_approve_rehire(uuid, text, uuid, uuid, text) to service_role;
grant execute on function public.employee_access_record_rehire(uuid, uuid, boolean, text) to service_role;
grant execute on function public.employee_access_record_apply_run(text, uuid, text, text, text[], jsonb, jsonb) to service_role;
