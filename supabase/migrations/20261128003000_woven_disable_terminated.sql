-- ============================================================================
-- WOVEN → ASK BUBBLES: DISABLE AN ACCOUNT WHEN WOVEN SAYS TERMINATED
-- ============================================================================
--
-- Owner, 28 Nov 2026: "make this automatic for both sunny and bubble". The
-- database half of WOVEN_ACCESS_MODE=apply with WOVEN_ACCESS_APPLY_ACTIONS=
-- DISABLE_TERMINATED (src/lib/employees/woven/access/apply.ts), ported from
-- the sibling app's account lifecycle (its 20261006002000), for ONE action:
--
--   DISABLE_TERMINATED  Woven's own Terminated status, read in the latest run
--                       of a directory whose latest finished sync succeeded:
--                       app_users.status = disabled and the link records the
--                       termination. The Supabase Auth ban and session
--                       revocation are the server's half (src/lib/auth/
--                       revocation.ts) and are recorded here afterwards.
--
-- WHICH ACCOUNT. Either
--   (a) the account LINKED to that Woven EmployeeID (employee_account_links,
--       woven_linked) whose status Woven manages (managed_status), or
--   (b) an UNCLASSIFIED account (no link row at all) whose email is EXACTLY,
--       case-insensitively, the terminated employee's Woven email, when that
--       email belongs to exactly one Woven employee and one account, the
--       account is not disabled already, is at location scope in a role Woven
--       may provision (location_manager, assistant_manager, employee — kept
--       equal to WOVEN_AUTO_PROVISION_ROLES, src/config/company/woven.ts, by a
--       test), and Woven's confirmed position mapping for the employee is one
--       of those roles too. This is the sibling's email-discovery link rule
--       (its employee_access_link_existing), applied at the moment of
--       termination: the link is stored ('termination_email_match', status
--       managed, role and location NOT managed) in the same transaction as the
--       disable, so the next run sees a linked, revoked account and does
--       nothing.
--   Never: a protected account (a role override, or admin/owner/developer), an
--   account marked not_woven_managed, or a link to another EmployeeID.
--
-- NOT HERE, ON PURPOSE: creating accounts, invitations, linking an ACTIVE
-- employee, role or location changes, re-enabling a rehire. No function below
-- writes a role, a scope or a location, and no function deletes anything.
-- auth.users is never read or written here.
--
-- ALSO: apply runs are recorded in employee_access_runs (mode apply, running →
-- completed / aborted / failed, one at a time) and their actions in
-- employee_access_actions with a result and a short result code. Codes only:
-- no name or email is written to either table by this file.
--
-- PRIVILEGES: still no UPDATE, DELETE or TRUNCATE on any table for anyone but
-- the owner. Every write goes through a SECURITY DEFINER function with an
-- empty search_path; the entry points are executable by service_role only,
-- the helper predicates by nobody but the owner.
--
-- Applied only with approval, verbatim, in one transaction. Idempotent.

-- ----------------------------------------------- 1. the link: one method ---

alter table public.employee_account_links drop constraint if exists employee_account_links_link_method_check;
alter table public.employee_account_links add constraint employee_account_links_link_method_check
  check (link_method in (
    'override_backfill', 'unmatched_backfill', 'admin_confirmed_email', 'admin_manual', 'provisioned',
    'termination_email_match'   -- one exact, unambiguous email match, linked when Woven said Terminated
  ));

-- ------------------------------------- 2. the run record: apply runs too ---

alter table public.employee_access_runs add column if not exists finished_at timestamptz;

alter table public.employee_access_runs drop constraint if exists employee_access_runs_mode_check;
alter table public.employee_access_runs add constraint employee_access_runs_mode_check
  check (mode in ('shadow', 'apply'));
alter table public.employee_access_runs drop constraint if exists employee_access_runs_status_check;
alter table public.employee_access_runs add constraint employee_access_runs_status_check
  check (status in ('running', 'completed', 'aborted', 'failed'));
alter table public.employee_access_runs drop constraint if exists employee_access_runs_shadow_is_final;
alter table public.employee_access_runs add constraint employee_access_runs_shadow_is_final
  check (mode = 'apply' or status in ('completed', 'aborted'));

/* At most one apply run at a time, enforced by Postgres. */
create unique index if not exists employee_access_runs_one_running
  on public.employee_access_runs (mode) where status = 'running';

alter table public.employee_access_actions add column if not exists result_code text;
alter table public.employee_access_actions drop constraint if exists employee_access_actions_result_check;
alter table public.employee_access_actions add constraint employee_access_actions_result_check
  check (result in (
    'shadow',    -- shadow mode: calculated, recorded, not applied
    'planned',   -- apply run: not a mutation this app applies, recorded only
    'skipped',   -- apply run: a mutation that was NOT attempted (guard, capability off, batch)
    'applied',   -- apply run: completed
    'failed'     -- apply run: attempted and did not complete; result_code says where
  ));
alter table public.employee_access_actions drop constraint if exists employee_access_actions_result_code_check;
alter table public.employee_access_actions add constraint employee_access_actions_result_code_check
  check (result_code is null or result_code ~ '^[a-z0-9_.:-]{1,80}$');

/*
 * Runs are append-only EXCEPT the one transition an apply run needs: running →
 * completed / aborted / failed, touching only the outcome columns. Actions stay
 * strictly append-only (20261002002000's trigger).
 */
create or replace function public.employee_access_runs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.status = 'running'
     and new.status in ('completed', 'aborted', 'failed')
     and new.id = old.id and new.mode = old.mode and new.requested_by = old.requested_by
     and new.directory_run_id is not distinct from old.directory_run_id
     and new.policy_version = old.policy_version and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'employee_access_runs is append-only'
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists employee_access_runs_append_only on public.employee_access_runs;
create trigger employee_access_runs_append_only
  before update or delete on public.employee_access_runs
  for each row execute function public.employee_access_runs_guard();

-- ------------------------------------------------ 3. shared re-checks ---

/* The latest FINISHED directory sync succeeded. A failed latest run means the directory is not current. */
create or replace function public.employee_access_directory_is_current()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select r.status::text = 'succeeded'
    from public.employee_sync_runs r
    where r.status::text <> 'running'
    order by r.started_at desc
    limit 1
  ), false);
$$;

/* Woven's status for one employee AS ASK BUBBLES MAY ACT ON IT: only when read in the latest run, else unknown. */
create or replace function public.employee_access_observed_status(p_external_employee_id text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select case when d.missing_sync_count > 0 then 'unknown' else d.employment_status::text end
    from public.employee_access_directory d
    where d.source_system = 'woven' and d.external_employee_id = p_external_employee_id
  ), 'not_found');
$$;

/* Protected: a role override, or an administrative role (ADMIN_CONSOLE_ROLES). Never disabled by Woven. */
create or replace function public.employee_access_is_protected(p_app_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.employee_role_overrides o where o.app_user_id = p_app_user_id)
      or exists (select 1 from public.app_users u where u.id = p_app_user_id and u.role::text in ('admin', 'owner', 'developer'));
$$;

-- ---------------------------------------------- 4. an apply run's record ---

create or replace function public.employee_access_begin_apply_run(
  p_requested_by     text,
  p_directory_run_id uuid,
  p_policy_version   text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run uuid;
begin
  /* A run that died mid-flight (a crashed function) must not hold the lock forever. */
  update public.employee_access_runs
     set status = 'failed', finished_at = now(), guard_codes = '{}'
   where status = 'running' and created_at < now() - interval '30 minutes';

  begin
    insert into public.employee_access_runs (mode, requested_by, directory_run_id, policy_version, status)
    values ('apply', p_requested_by, p_directory_run_id, p_policy_version, 'running')
    returning id into v_run;
  exception when unique_violation then
    raise exception 'employee_access_apply_in_progress' using errcode = 'lock_not_available';
  end;
  return v_run;
end;
$$;

create or replace function public.employee_access_finish_apply_run(
  p_run         uuid,
  p_status      text,
  p_guard_codes text[],
  p_counts      jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.employee_access_runs
     set status = p_status,
         guard_codes = case when p_status = 'aborted' then coalesce(p_guard_codes, '{}') else '{}' end,
         counts = coalesce(p_counts, '{}'::jsonb),
         finished_at = now()
   where id = p_run and mode = 'apply' and status = 'running';
  if not found then
    raise exception 'employee_access_finish_apply_run: no running apply run %', p_run
      using errcode = 'no_data_found';
  end if;
end;
$$;

create or replace function public.employee_access_record_apply_actions(p_run uuid, p_actions jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if jsonb_typeof(p_actions) is distinct from 'array' then
    raise exception 'employee_access_record_apply_actions: actions must be a JSON array'
      using errcode = 'invalid_parameter_value';
  end if;
  perform 1 from public.employee_access_runs where id = p_run and mode = 'apply' and status = 'running';
  if not found then
    raise exception 'employee_access_record_apply_actions: no running apply run %', p_run
      using errcode = 'no_data_found';
  end if;

  insert into public.employee_access_actions (
    access_run_id, external_employee_id, app_user_id, action, is_primary, reason_codes,
    before_values, after_values, woven_source_at, result, result_code
  )
  select
    p_run,
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
  get diagnostics v_count = row_count;

  if exists (
    select 1 from public.employee_access_actions where access_run_id = p_run and result = 'shadow'
  ) then
    raise exception 'employee_access_record_apply_actions: an apply run records no shadow results'
      using errcode = 'check_violation';
  end if;
  return v_count;
end;
$$;

-- --------------------------------------------- 5. DISABLE_TERMINATED ---

create or replace function public.employee_access_disable_terminated(
  p_app_user_id          uuid,
  p_external_employee_id text,
  p_set_by               text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link   record;
  v_user   record;
  v_dir    record;
  v_email  text;
  v_mapped text;
  v_via    text;
begin
  if p_app_user_id is null or p_external_employee_id is null then
    raise exception 'disable_invalid_input' using errcode = 'invalid_parameter_value';
  end if;
  /* One decision per employee at a time. */
  perform pg_advisory_xact_lock(hashtext('woven-access-employee:' || p_external_employee_id));

  /*
   * ONLY Woven's own Terminated, read in the latest run, from a directory
   * whose latest finished sync succeeded. Missing, unknown, stale or a past
   * TerminationDate on an Active employee: refused.
   */
  if not public.employee_access_directory_is_current() then
    raise exception 'disable_directory_not_current' using errcode = 'check_violation';
  end if;
  if public.employee_access_observed_status(p_external_employee_id) <> 'terminated' then
    raise exception 'disable_not_terminated_in_latest_read' using errcode = 'check_violation';
  end if;

  select u.id, u.email, u.role::text as role, u.status::text as status, u.scope_level::text as scope_level
    into v_user
    from public.app_users u where u.id = p_app_user_id for update;
  if not found then
    raise exception 'disable_account_not_found' using errcode = 'no_data_found';
  end if;
  if public.employee_access_is_protected(p_app_user_id) then
    raise exception 'disable_protected_account' using errcode = 'check_violation';
  end if;

  select * into v_link from public.employee_account_links where app_user_id = p_app_user_id for update;
  if found then
    /* (a) Linked: the link is authoritative; email is never re-matched. */
    if v_link.management <> 'woven_linked' or v_link.external_employee_id is distinct from p_external_employee_id then
      raise exception 'disable_not_linked' using errcode = 'check_violation';
    end if;
    if not v_link.managed_status then
      raise exception 'disable_status_not_managed' using errcode = 'check_violation';
    end if;
    v_via := 'link';
  else
    /* (b) Unclassified: one exact email match, re-verified here under the locks. */
    if exists (select 1 from public.employee_account_links l where l.source_system = 'woven' and l.external_employee_id = p_external_employee_id) then
      raise exception 'disable_employee_linked_to_another_account' using errcode = 'unique_violation';
    end if;
    select d.* into v_dir from public.employee_access_directory d
     where d.source_system = 'woven' and d.external_employee_id = p_external_employee_id
     for share;
    v_email := lower(btrim(coalesce(v_user.email, '')));
    /* EXACT match only: the same address, compared case-insensitively. No fuzzy matching. */
    if v_email = '' or lower(btrim(coalesce(v_dir.email_address, ''))) <> v_email then
      raise exception 'disable_email_mismatch' using errcode = 'check_violation';
    end if;
    if (select count(*) from public.employee_access_directory d where lower(btrim(d.email_address)) = v_email) <> 1
       or 'duplicate_email' = any (coalesce(v_dir.data_issues, '{}')) then
      raise exception 'disable_duplicate_email' using errcode = 'check_violation';
    end if;
    if (select count(*) from public.app_users u where lower(btrim(u.email)) = v_email) <> 1 then
      raise exception 'disable_duplicate_account' using errcode = 'check_violation';
    end if;
    if v_user.status = 'disabled' then
      raise exception 'disable_unlinked_account_already_disabled' using errcode = 'check_violation';
    end if;
    /*
     * Woven manages employment status only for a location-level account in a
     * role Woven may provision, whose confirmed Woven position is one of those
     * roles (WOVEN_AUTO_PROVISION_ROLES). Anyone else is left to a person.
     */
    select p.mapped_role::text into v_mapped
      from public.woven_position_map p
     where p.woven_position_id = v_dir.position_id and p.status::text = 'mapped' and p.is_confirmed;
    if not (v_user.role in ('location_manager', 'assistant_manager', 'employee')
            and v_user.scope_level = 'location'
            and coalesce(v_mapped in ('location_manager', 'assistant_manager', 'employee'), false)) then
      raise exception 'disable_status_not_woven_managed' using errcode = 'check_violation';
    end if;

    insert into public.employee_account_links (
      app_user_id, management, source_system, external_employee_id, link_method,
      managed_status, managed_location, managed_role,
      terminated_at, revoked_woven_status, last_synced_at, reason, set_by
    ) values (
      p_app_user_id, 'woven_linked', 'woven', p_external_employee_id, 'termination_email_match',
      true, false, false,
      now(), 'terminated', now(), 'One exact email match to one unprotected account; Terminated in Woven', left(p_set_by, 120)
    );
    v_via := 'email_match';
  end if;

  if v_user.status <> 'disabled' then
    update public.app_users set status = 'disabled', updated_by = null where id = p_app_user_id;
    insert into public.app_user_audit (target_user_id, target_email, actor_user_id, actor_email, action, from_value, to_value)
    values (p_app_user_id, v_user.email, null, left(p_set_by, 120), 'status_changed', v_user.status, 'disabled');
  end if;

  update public.employee_account_links
     set terminated_at = coalesce(terminated_at, now()),
         revoked_woven_status = 'terminated',
         last_synced_at = now()
   where app_user_id = p_app_user_id;

  return case when v_user.status = 'disabled' then 'already_disabled' else 'disabled' end || '.' || v_via;
end;
$$;

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

-- ---------------------------------------------------------- 6. grants ---

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.employee_access_runs_guard()',
    'public.employee_access_directory_is_current()',
    'public.employee_access_observed_status(text)',
    'public.employee_access_is_protected(uuid)',
    'public.employee_access_begin_apply_run(text, uuid, text)',
    'public.employee_access_finish_apply_run(uuid, text, text[], jsonb)',
    'public.employee_access_record_apply_actions(uuid, jsonb)',
    'public.employee_access_disable_terminated(uuid, text, text)',
    'public.employee_access_record_revocation(uuid, boolean, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_fn);
  end loop;
end;
$$;

/* The server's entry points. The trigger function and the three helper predicates stay owner-only. */
grant execute on function public.employee_access_begin_apply_run(text, uuid, text) to service_role;
grant execute on function public.employee_access_finish_apply_run(uuid, text, text[], jsonb) to service_role;
grant execute on function public.employee_access_record_apply_actions(uuid, jsonb) to service_role;
grant execute on function public.employee_access_disable_terminated(uuid, text, text) to service_role;
grant execute on function public.employee_access_record_revocation(uuid, boolean, text, text) to service_role;
