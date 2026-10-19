-- ============================================================================
-- WOVEN DISABLE_TERMINATED CHECKS — run by scripts/db/verify-migrations.sh
-- ============================================================================
--
-- Applied as the cluster superuser against a freshly migrated THROWAWAY
-- database, after every migration. RAISES on the first failure so the harness
-- stops. One transaction, rolled back. Never run against a real project.
--
-- Proves (20261019001000_woven_disable_terminated_apply.sql):
--   1. the success path disables the profile, stamps the link, and writes the
--      audit rows (status_changed, then access_revoked once the server's auth
--      ban + session revocation is recorded)
--   2. each documented refusal, by its short code, with NOTHING changed:
--      disable_company_scope (wrong stated company, directory row of another
--      company, latest sync run of another company, no company on the row),
--      disable_not_linked, disable_link_not_confirmed (override_backfill and
--      unmatched_backfill), disable_status_not_managed,
--      disable_protected_account (admin, owner, developer, role override),
--      disable_not_terminated_in_latest_read (active, unknown, missing from
--      the latest read, not found), disable_directory_not_current (latest
--      finished sync failed)
--   3. a second call yields 'already_disabled' (no new status audit row) and
--      the revocation stamp is idempotent
--   4. anon and authenticated cannot EXECUTE the three entry points; only
--      service_role can; the predicates are owner-only

\set ON_ERROR_STOP 1
begin;

create function pg_temp.expect_code(p_label text, p_sql text, p_code text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'DISABLE_TERMINATED CHECK FAILED (%): the call succeeded', p_label;
exception
  when others then
    if sqlerrm like 'DISABLE_TERMINATED CHECK FAILED%' then raise; end if;
    if sqlerrm <> p_code then
      raise exception 'DISABLE_TERMINATED CHECK FAILED (%): expected "%", got "%" (%)', p_label, p_code, sqlerrm, sqlstate;
    end if;
end;
$$;

create function pg_temp.assert(p_label text, p_ok boolean) returns void
language plpgsql as $$
begin
  if p_ok is not true then raise exception 'DISABLE_TERMINATED CHECK FAILED (%)', p_label; end if;
end;
$$;

/* One account + (optionally) its link and directory row. n makes ids unique. */
create function pg_temp.mk(
  n int,
  p_role text default 'location_manager',
  p_method text default 'admin_confirmed_email',
  p_managed boolean default true,
  p_link boolean default true,
  p_status text default 'terminated',
  p_company uuid default '55839f24-9241-418c-8405-37baf9a42a87'
) returns uuid
language plpgsql as $$
declare
  v_id uuid := ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
  v_emp text := 'EMP' || n;
begin
  insert into auth.users (id, email, email_confirmed_at) values (v_id, 'u' || n || '@example.test', now());
  insert into public.app_users (id, email, display_name, role, status, scope_level, scope_primary_area_id)
  values (v_id, 'u' || n || '@example.test', 'User ' || n, p_role::public.app_user_role, 'active',
          case when p_role in ('admin', 'owner', 'developer') then 'global' else 'location' end::public.app_scope_level,
          case when p_role in ('admin', 'owner', 'developer') then null else 'loc-0307' end);
  if p_status is not null then
    insert into public.employee_access_directory (source_system, external_employee_id, employment_status, record_hash, woven_company_id)
    values ('woven', v_emp, p_status::public.employee_employment_status, repeat('a', 64), p_company);
  end if;
  if p_link then
    insert into public.employee_account_links (app_user_id, management, external_employee_id, link_method, managed_status, set_by)
    values (v_id, 'woven_linked', v_emp, p_method, p_managed, 'check');
  end if;
  return v_id;
end;
$$;

create function pg_temp.disable(p_user uuid, p_emp text, p_company uuid default '55839f24-9241-418c-8405-37baf9a42a87') returns text
language sql as $$
  select public.employee_access_disable_terminated(p_user, p_emp, p_company, 'woven-termination:check');
$$;

create function pg_temp.untouched(p_user uuid) returns boolean
language sql as $$
  select (select status::text from public.app_users where id = p_user) <> 'disabled'
     and not exists (select 1 from public.app_user_audit where target_user_id = p_user)
     and not exists (select 1 from public.employee_account_links where app_user_id = p_user and terminated_at is not null);
$$;

-- a current, pinned-company directory sync: finished, succeeded
insert into public.employee_sync_runs (requested_by, status, started_at, finished_at)
values ('check', 'succeeded', now() - interval '2 hours', now() - interval '119 minutes');

-- ---------------------------------------------------------------- 1. success
create temp table good as select pg_temp.mk(1) as id;

do $$
declare
  v_id uuid := (select id from good);
  v_first text;
begin
  v_first := pg_temp.disable(v_id, 'EMP1');
  perform pg_temp.assert('success returns disabled', v_first = 'disabled');
  perform pg_temp.assert('profile disabled', (select status::text from public.app_users where id = v_id) = 'disabled');
  perform pg_temp.assert('link stamped terminated',
    (select terminated_at is not null and revoked_woven_status = 'terminated' and access_revoked_at is null
       from public.employee_account_links where app_user_id = v_id));
  perform pg_temp.assert('status audit row',
    (select count(*) from public.app_user_audit
      where target_user_id = v_id and action = 'status_changed' and from_value = 'active' and to_value = 'disabled'
        and actor_user_id is null and actor_email = 'woven-termination:check') = 1);

  -- the server's half: ban + sessions revoked, then the record
  perform public.employee_access_record_revocation(v_id, true, 'auth_ban,sessions_revoked', 'woven-termination:check');
  perform pg_temp.assert('revocation stamp', (select access_revoked_at is not null from public.employee_account_links where app_user_id = v_id));
  perform pg_temp.assert('access_revoked audit row',
    (select count(*) from public.app_user_audit where target_user_id = v_id and action = 'access_revoked' and to_value = 'auth_ban,sessions_revoked') = 1);

  -- 3. idempotent: second call = no action, no second status row; revocation stamp unchanged
  perform pg_temp.assert('second call already_disabled', pg_temp.disable(v_id, 'EMP1') = 'already_disabled');
  perform pg_temp.assert('no second status audit row',
    (select count(*) from public.app_user_audit where target_user_id = v_id and action = 'status_changed') = 1);
  perform pg_temp.assert('still disabled', (select status::text from public.app_users where id = v_id) = 'disabled');
  perform pg_temp.assert('never enabled by this path', (select count(*) from public.app_user_audit where target_user_id = v_id and to_value = 'active') = 0);
end;
$$;

-- an incomplete revocation is audited but does NOT stamp access_revoked_at
create temp table half as select pg_temp.mk(2) as id;
do $$
declare v_id uuid := (select id from half);
begin
  perform pg_temp.disable(v_id, 'EMP2');
  perform public.employee_access_record_revocation(v_id, false, 'failed:sessions', 'woven-termination:check');
  perform pg_temp.assert('incomplete: not stamped', (select access_revoked_at is null from public.employee_account_links where app_user_id = v_id));
  perform pg_temp.assert('incomplete: audited',
    (select count(*) from public.app_user_audit where target_user_id = v_id and action = 'access_revocation_incomplete') = 1);
  -- retried: the disable is a no-op, then the revocation completes
  perform pg_temp.assert('retry already_disabled', pg_temp.disable(v_id, 'EMP2') = 'already_disabled');
  perform public.employee_access_record_revocation(v_id, true, 'auth_ban,sessions_revoked', 'woven-termination:check');
  perform pg_temp.assert('retry: stamped', (select access_revoked_at is not null from public.employee_account_links where app_user_id = v_id));
end;
$$;
-- a revocation cannot be stamped on a link that was never terminated
create temp table never as select pg_temp.mk(3) as id;
select pg_temp.expect_code('revocation_not_terminated',
  format($q$select public.employee_access_record_revocation(%L, true, 'x', 'check')$q$, (select id from never)),
  'record_revocation_not_terminated');

-- ------------------------------------------------------------- 2. refusals
-- link problems
create temp table cases (label text, id uuid, emp text, company uuid, code text);
insert into cases
select 'unlinked account', pg_temp.mk(10, p_link => false), 'EMP10', '55839f24-9241-418c-8405-37baf9a42a87'::uuid, 'disable_not_linked'
union all select 'override_backfill link', pg_temp.mk(11, p_method => 'override_backfill'), 'EMP11', '55839f24-9241-418c-8405-37baf9a42a87', 'disable_link_not_confirmed'
union all select 'unmatched_backfill link', pg_temp.mk(12, p_method => 'unmatched_backfill'), 'EMP12', '55839f24-9241-418c-8405-37baf9a42a87', 'disable_link_not_confirmed'
union all select 'managed_status false', pg_temp.mk(13, p_managed => false), 'EMP13', '55839f24-9241-418c-8405-37baf9a42a87', 'disable_status_not_managed'
union all select 'admin', pg_temp.mk(14, p_role => 'admin'), 'EMP14', '55839f24-9241-418c-8405-37baf9a42a87', 'disable_protected_account'
union all select 'owner', pg_temp.mk(15, p_role => 'owner'), 'EMP15', '55839f24-9241-418c-8405-37baf9a42a87', 'disable_protected_account'
union all select 'developer', pg_temp.mk(16, p_role => 'developer'), 'EMP16', '55839f24-9241-418c-8405-37baf9a42a87', 'disable_protected_account'
union all select 'active in Woven', pg_temp.mk(17, p_status => 'active'), 'EMP17', '55839f24-9241-418c-8405-37baf9a42a87', 'disable_not_terminated_in_latest_read'
union all select 'unknown in Woven', pg_temp.mk(18, p_status => 'unknown'), 'EMP18', '55839f24-9241-418c-8405-37baf9a42a87', 'disable_not_terminated_in_latest_read'
union all select 'wrong stated company', pg_temp.mk(19), 'EMP19', '1ba00000-0000-4000-8000-0000000000aa', 'disable_company_scope'
union all select 'null stated company', pg_temp.mk(20), 'EMP20', null, 'disable_company_scope';

-- a link naming a DIFFERENT EmployeeID than the one asked about
insert into cases select 'link names another employee', pg_temp.mk(21), 'EMP-OTHER', '55839f24-9241-418c-8405-37baf9a42a87', 'disable_company_scope';
-- (no directory row EMP-OTHER exists, so the company/directory proof refuses first; the same
--  mismatch with a real directory row is covered next)
create temp table swap as select pg_temp.mk(22) as id;
insert into public.employee_access_directory (source_system, external_employee_id, employment_status, record_hash, woven_company_id)
values ('woven', 'EMP22-B', 'terminated', repeat('b', 64), '55839f24-9241-418c-8405-37baf9a42a87');
insert into cases select 'link names another employee (real row)', (select id from swap), 'EMP22-B', '55839f24-9241-418c-8405-37baf9a42a87', 'disable_not_linked';

-- a role override makes an otherwise ordinary account protected
create temp table ovr as select pg_temp.mk(23) as id;
insert into public.employee_role_overrides (app_user_id, external_employee_id, locked_role, locked_scope_level, reason, set_by)
select id, 'EMP23', 'location_manager', 'location', 'check', 'check' from ovr;
insert into cases select 'role override', (select id from ovr), 'EMP23', '55839f24-9241-418c-8405-37baf9a42a87', 'disable_protected_account';

-- a directory row that is not in the latest read (absent: missing_sync_count > 0)
create temp table gone as select pg_temp.mk(24) as id;
update public.employee_access_directory set missing_sync_count = 2 where external_employee_id = 'EMP24';
insert into cases select 'missing from latest read', (select id from gone), 'EMP24', '55839f24-9241-418c-8405-37baf9a42a87', 'disable_not_terminated_in_latest_read';

-- no directory row at all (not found)
create temp table nodir as select pg_temp.mk(25, p_status => null) as id;
insert into cases select 'no directory row', (select id from nodir), 'EMP25', '55839f24-9241-418c-8405-37baf9a42a87', 'disable_company_scope';

do $$
declare r record;
begin
  for r in select * from cases loop
    perform pg_temp.expect_code(r.label,
      format('select pg_temp.disable(%L, %L, %L)', r.id, r.emp, r.company), r.code);
    perform pg_temp.assert(r.label || ': nothing changed', pg_temp.untouched(r.id));
  end loop;
end;
$$;

-- directory row of ANOTHER company / with NO company (the table CHECK/NOT NULL are lifted inside this
-- rolled-back transaction only, to prove the function does not rely on them)
alter table public.employee_access_directory drop constraint employee_access_directory_pinned_company;
alter table public.employee_access_directory alter column woven_company_id drop not null;
create temp table foreign_row as select pg_temp.mk(30, p_company => '1ba00000-0000-4000-8000-0000000000aa') as id;
create temp table null_row as select pg_temp.mk(31, p_company => null) as id;
select pg_temp.expect_code('directory row of another company',
  format('select pg_temp.disable(%L, %L)', (select id from foreign_row), 'EMP30'), 'disable_company_scope');
select pg_temp.expect_code('directory row without a company',
  format('select pg_temp.disable(%L, %L)', (select id from null_row), 'EMP31'), 'disable_company_scope');
do $$
begin
  perform pg_temp.assert('foreign row: nothing changed', pg_temp.untouched((select id from foreign_row)));
  perform pg_temp.assert('null-company row: nothing changed', pg_temp.untouched((select id from null_row)));
end;
$$;

-- latest sync run of ANOTHER company, then with the latest run failed
create temp table fresh as select pg_temp.mk(40) as id;
alter table public.employee_sync_runs drop constraint employee_sync_runs_pinned_company;
insert into public.employee_sync_runs (requested_by, status, started_at, finished_at, woven_company_id)
values ('check', 'succeeded', now() - interval '1 hour', now() - interval '59 minutes', '1ba00000-0000-4000-8000-0000000000aa');
select pg_temp.expect_code('latest run of another company',
  format('select pg_temp.disable(%L, %L)', (select id from fresh), 'EMP40'), 'disable_directory_not_current');
do $$ begin perform pg_temp.assert('latest run another company: nothing changed', pg_temp.untouched((select id from fresh))); end; $$;

insert into public.employee_sync_runs (requested_by, status, started_at, finished_at, error_code, woven_company_id)
values ('check', 'failed', now() - interval '30 minutes', now() - interval '29 minutes', 'woven_unreachable', '55839f24-9241-418c-8405-37baf9a42a87');
select pg_temp.expect_code('latest run failed',
  format('select pg_temp.disable(%L, %L)', (select id from fresh), 'EMP40'), 'disable_directory_not_current');
do $$ begin perform pg_temp.assert('latest run failed: nothing changed', pg_temp.untouched((select id from fresh))); end; $$;

-- ------------------------------------------------------------ 4. privileges
do $$
declare
  v_fn text;
  v_role text;
begin
  foreach v_fn in array array[
    'public.employee_access_disable_terminated(uuid, text, uuid, text)',
    'public.employee_access_record_revocation(uuid, boolean, text, text)',
    'public.employee_access_record_apply_run(text, uuid, text, text[], jsonb, jsonb)'
  ] loop
    foreach v_role in array array['anon', 'authenticated', 'public'] loop
      if v_role = 'public' then
        if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    where p.oid = v_fn::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
          raise exception 'DISABLE_TERMINATED CHECK FAILED (privileges): PUBLIC can execute %', v_fn;
        end if;
      elsif has_function_privilege(v_role, v_fn, 'execute') then
        raise exception 'DISABLE_TERMINATED CHECK FAILED (privileges): % can execute %', v_role, v_fn;
      end if;
    end loop;
    if not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'DISABLE_TERMINATED CHECK FAILED (privileges): service_role cannot execute %', v_fn;
    end if;
  end loop;

  foreach v_fn in array array[
    'public.employee_access_directory_is_current()',
    'public.employee_access_observed_status(text)',
    'public.employee_access_is_protected(uuid)'
  ] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(v_role, v_fn, 'execute') then
        raise exception 'DISABLE_TERMINATED CHECK FAILED (privileges): % can execute helper %', v_role, v_fn;
      end if;
    end loop;
  end loop;
end;
$$;

-- a browser role really is refused when it calls the function
set local role authenticated;
select pg_temp.expect_code('authenticated call',
  $q$select public.employee_access_disable_terminated('00000000-0000-4000-8000-000000000001', 'EMP1', '55839f24-9241-418c-8405-37baf9a42a87', 'x')$q$,
  'permission denied for function employee_access_disable_terminated');
reset role;

rollback;
