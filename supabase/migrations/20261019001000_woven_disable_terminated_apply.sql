-- ============================================================================
-- WOVEN → ASK BUBBLES: DISABLE_TERMINATED, the database half
-- ============================================================================
--
-- NOT APPLIED. Written for review; apply only with approval, verbatim, in one
-- transaction, and only after the app code that calls it is deployed with
-- WOVEN_TERMINATION_ENFORCEMENT unset (the default: off).
--
-- WHAT THIS ADDS — one capability, nothing else:
--
--   When the server's termination enforcement is switched on, an Ask Bubbles
--   account may be DISABLED because Woven says its employee is Terminated.
--   Three functions do it, and every one re-verifies its own facts under row
--   locks, because the server plans first and things move in between:
--
--   employee_access_disable_terminated   sets app_users.status = 'disabled',
--                                        stamps the link's terminated_at.
--   employee_access_record_revocation    after the server banned the auth user
--                                        and revoked its sessions: stamps the
--                                        link's access_revoked_at; audits.
--   employee_access_record_apply_run     records one apply run and its
--                                        actions (employee_access_runs /
--                                        employee_access_actions).
--
-- WHAT DISABLE_TERMINATED REFUSES (each a short error code, nothing changed):
--
--   disable_not_linked              no link row, not woven_linked, or the link
--                                   names another EmployeeID. Never matched by
--                                   name or email.
--   disable_link_not_confirmed      link_method is not one a person (or the
--                                   approved provisioning) confirmed.
--   disable_status_not_managed      managed_status is off.
--   disable_protected_account       a role override, or role admin / owner /
--                                   developer. So the last active administrator
--                                   is never reachable from here; the
--                                   app_users_keep_one_admin trigger remains
--                                   the backstop for every path.
--   disable_company_scope           the company stated by the server, the
--                                   company on the EmployeeID's directory row
--                                   and on the latest directory sync run are
--                                   not ALL the pinned Midwest Soap Makers id
--                                   (55839f24-9241-418c-8405-37baf9a42a87).
--   disable_directory_not_current   the latest finished directory sync did not
--                                   succeed.
--   disable_not_terminated_in_latest_read
--                                   Woven's status for this EmployeeID, read in
--                                   the latest run, is not Terminated (missing,
--                                   unknown, Active with a past TerminationDate,
--                                   not found: all refused).
--
-- NOT HERE, ON PURPOSE: re-enabling anybody (a rehire stays FLAG_REHIRE_REVIEW;
-- an administrator re-enables by hand through User Management), role or
-- location changes, account creation, invitations, deleting anything.
-- `auth.users` is never read or written by this file; the Auth ban and session
-- revocation are the server's half (src/lib/auth/revocation.ts).
--
-- AUDIT. No new audit action: `status_changed`, `access_revoked` and
-- `access_revocation_incomplete` already exist in app_user_audit's vocabulary
-- (20261002001000). Rows are written with a null actor_user_id and
-- actor_email = 'woven-termination:<requester>', so history shows it was the
-- sync, not a person.
--
-- PRIVILEGES: unchanged for tables (service_role keeps SELECT, INSERT only; no
-- UPDATE, DELETE or TRUNCATE for anyone). Every write to app_users and the
-- link goes through a SECURITY DEFINER function with an empty search_path,
-- executable by service_role only; the two helper predicates are owner-only.
--
-- Idempotent: constraints are dropped and re-added, functions are
-- create-or-replace, the column is add-if-not-exists.

-- ------------------------------------------- 1. the run record: apply runs ---

alter table public.employee_access_runs drop constraint if exists employee_access_runs_mode_check;
alter table public.employee_access_runs add constraint employee_access_runs_mode_check
  check (mode in ('shadow', 'apply'));

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
    'skipped'   -- apply run: a DISABLE_TERMINATED that was NOT attempted (guard, protection, batch)
  ));

-- ------------------------------------------------------ 2. shared re-checks ---

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

/* Protected: a role override, or an administrative role. Never disabled by Woven. */
create or replace function public.employee_access_is_protected(p_app_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.employee_role_overrides o where o.app_user_id = p_app_user_id)
      or exists (select 1 from public.app_users u where u.id = p_app_user_id and u.role::text in ('admin', 'owner', 'developer'));
$$;

-- ------------------------------------------------------ 3. DISABLE_TERMINATED ---

create or replace function public.employee_access_disable_terminated(
  p_app_user_id          uuid,
  p_external_employee_id text,
  p_woven_company_id     uuid,
  p_set_by               text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link   record;
  v_status text;
  v_pinned constant uuid := '55839f24-9241-418c-8405-37baf9a42a87';
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

  select * into v_link from public.employee_account_links where app_user_id = p_app_user_id for update;
  if not found or v_link.management <> 'woven_linked' or v_link.external_employee_id is distinct from p_external_employee_id then
    raise exception 'disable_not_linked' using errcode = 'check_violation';
  end if;
  /* A person confirmed this link. `override_backfill` and `unmatched_backfill` are not that. */
  if v_link.link_method not in ('admin_confirmed_email', 'admin_manual', 'provisioned') then
    raise exception 'disable_link_not_confirmed' using errcode = 'check_violation';
  end if;
  if not v_link.managed_status then
    raise exception 'disable_status_not_managed' using errcode = 'check_violation';
  end if;
  if public.employee_access_is_protected(p_app_user_id) then
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

  if v_status <> 'disabled' then
    update public.app_users set status = 'disabled', updated_by = null where id = p_app_user_id;
    insert into public.app_user_audit (target_user_id, target_email, actor_user_id, actor_email, action, from_value, to_value)
    select p_app_user_id, u.email, null, left(p_set_by, 120), 'status_changed', v_status, 'disabled'
      from public.app_users u where u.id = p_app_user_id;
  end if;

  update public.employee_account_links
     set terminated_at = coalesce(terminated_at, now()),
         revoked_woven_status = 'terminated',
         last_synced_at = now()
   where app_user_id = p_app_user_id;

  return case when v_status = 'disabled' then 'already_disabled' else 'disabled' end;
end;
$$;

comment on function public.employee_access_disable_terminated(uuid, text, uuid, text) is
  'Server-only. Disables ONE account whose confirmed, status-managed, unprotected link names an EmployeeID that Woven (pinned company, latest successful sync) calls Terminated. Re-verifies everything under row locks; refuses with a short code otherwise. Never enables, creates or deletes anything.';

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
     where app_user_id = p_app_user_id and terminated_at is not null;
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
  'Server-only. After the Auth ban and session revocation: stamps access_revoked_at on a terminated link (only when both steps succeeded) and audits access_revoked / access_revocation_incomplete.';

-- ------------------------------------------------------ 4. the apply run record ---

create or replace function public.employee_access_record_apply_run(
  p_requested_by      text,
  p_directory_run_id  uuid,
  p_policy_version    text,
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

  perform pg_advisory_xact_lock(hashtext('employee_access_record_apply_run'));

  insert into public.employee_access_runs (mode, requested_by, directory_run_id, policy_version, status, guard_codes, counts)
  values (
    'apply', p_requested_by, p_directory_run_id, p_policy_version,
    case when cardinality(coalesce(p_guard_codes, '{}')) > 0 then 'aborted' else 'completed' end,
    coalesce(p_guard_codes, '{}'), coalesce(p_counts, '{}'::jsonb)
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

comment on function public.employee_access_record_apply_run(text, uuid, text, text[], jsonb, jsonb) is
  'Server-only. Records one APPLY run (termination enforcement) and its DISABLE_TERMINATED outcomes in one transaction. Writes only employee_access_runs and employee_access_actions.';

-- ---------------------------------------------------------- 5. privileges ---
--
-- Nothing inherited. Every function: ALL revoked from everyone including
-- service_role, then EXECUTE granted to service_role for the three entry
-- points. The three predicates stay owner-only (they are called from inside
-- the definer functions, which run as the owner).

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.employee_access_directory_is_current()',
    'public.employee_access_observed_status(text)',
    'public.employee_access_is_protected(uuid)',
    'public.employee_access_disable_terminated(uuid, text, uuid, text)',
    'public.employee_access_record_revocation(uuid, boolean, text, text)',
    'public.employee_access_record_apply_run(text, uuid, text, text[], jsonb, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_fn);
  end loop;
end;
$$;

grant execute on function public.employee_access_disable_terminated(uuid, text, uuid, text) to service_role;
grant execute on function public.employee_access_record_revocation(uuid, boolean, text, text) to service_role;
grant execute on function public.employee_access_record_apply_run(text, uuid, text, text[], jsonb, jsonb) to service_role;
