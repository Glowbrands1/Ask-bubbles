-- ============================================================================
-- CAPTURED LIVE-ONLY OBJECTS — run by scripts/db/verify-migrations.sh
-- ============================================================================
--
-- Proves 20261017001000_capture_live_only_woven_adoption_objects.sql leaves the
-- database in the state the live Ask Bubbles database is in (read-only comparison,
-- 2026-10-19): nothing weaker, nothing wider.
--
--   1. the audit action list has 12 entries, including the two Sunny-derived ones
--   2. the links guard exists, is a plain (invoker) trigger function with the
--      search_path pinned, is executable by nobody, and is installed as an enabled
--      BEFORE UPDATE row trigger on employee_account_links
--   3. the guard's BEHAVIOUR: the three managed flags (and updated_at) may change;
--      every other column, alone or mixed with a flag, is refused
--   4. service_role may UPDATE exactly managed_status, managed_location, managed_role
--      of employee_account_links, no other column and not the table; anon and
--      authenticated hold nothing on it
--   5. auth_clear_user_credentials(uuid) is security definer with the search_path
--      pinned, executable by service_role only
--   6. the definitions created here are byte-for-byte (after comments and whitespace
--      are stripped) the ones measured on the live database
--
-- Applied as the cluster superuser; everything runs in one rolled-back transaction.

\set ON_ERROR_STOP 1
begin;

create function pg_temp.fail(p_label text) returns void
language plpgsql as $$
begin
  raise exception 'CAPTURE CHECK FAILED: %', p_label;
end;
$$;

create function pg_temp.expect(p_label text, p_ok boolean) returns void
language plpgsql as $$
begin
  if p_ok is not true then perform pg_temp.fail(p_label); end if;
end;
$$;

create function pg_temp.expect_error(p_label text, p_sql text, p_state text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'CAPTURE CHECK FAILED (%): the statement succeeded', p_label;
exception
  when others then
    if sqlstate = 'P0001' and sqlerrm like 'CAPTURE CHECK FAILED%' then raise; end if;
    if sqlstate <> p_state then
      raise exception 'CAPTURE CHECK FAILED (%): expected SQLSTATE %, got % (%)', p_label, p_state, sqlstate, sqlerrm;
    end if;
end;
$$;

-- 1 ------------------------------------------------------------ audit vocabulary
select pg_temp.expect('audit check lists 12 actions incl. managed_flags_changed and credentials_reset',
  (select pg_get_constraintdef(oid) like '%managed_flags_changed%' and pg_get_constraintdef(oid) like '%credentials_reset%'
          and (select count(*) from regexp_matches(pg_get_constraintdef(oid), '''[a-z_]+''::text', 'g')) = 12
     from pg_constraint where conrelid = 'public.app_user_audit'::regclass and conname = 'app_user_audit_action_check'));

-- 2 ------------------------------------------------------------------ the guard
select pg_temp.expect('guard function exists, invoker, search_path pinned',
  (select not p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=""']
     from pg_proc p where p.oid = to_regprocedure('public.employee_account_links_guard_update()')));

select pg_temp.expect('nobody can execute the guard function',
  not has_function_privilege('anon', 'public.employee_account_links_guard_update()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.employee_account_links_guard_update()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.employee_account_links_guard_update()', 'EXECUTE'));

select pg_temp.expect('guard trigger is an enabled BEFORE UPDATE row trigger on employee_account_links',
  (select t.tgenabled = 'O' and (t.tgtype & 2) = 2 and (t.tgtype & 16) = 16 and (t.tgtype & 1) = 1
     from pg_trigger t where t.tgrelid = 'public.employee_account_links'::regclass and t.tgname = 'employee_account_links_guard_update'));

-- 3 ------------------------------------------------------ the guard's behaviour
create temp table guard_probe (
  managed_status boolean default false, managed_location boolean default false, managed_role boolean default false,
  updated_at timestamptz default now(), external_employee_id text default 'E1', link_method text default 'admin_manual',
  terminated_at timestamptz, access_revoked_at timestamptz
);
create trigger guard_probe_guard before update on guard_probe
  for each row execute function public.employee_account_links_guard_update();
insert into guard_probe default values;

update guard_probe set managed_status = true;
update guard_probe set managed_location = true, managed_role = true, updated_at = now() + interval '1 second';
select pg_temp.expect('the three flags and updated_at may change',
  (select managed_status and managed_location and managed_role from guard_probe));

select pg_temp.expect_error('identity column external_employee_id', $q$update guard_probe set external_employee_id = 'E2'$q$, '23514');
select pg_temp.expect_error('identity column link_method',          $q$update guard_probe set link_method = 'unmatched_backfill'$q$, '23514');
select pg_temp.expect_error('lifecycle stamp terminated_at',        $q$update guard_probe set terminated_at = now()$q$, '23514');
select pg_temp.expect_error('lifecycle stamp access_revoked_at',    $q$update guard_probe set access_revoked_at = now()$q$, '23514');
select pg_temp.expect_error('a flag mixed with an identity column is refused as a whole',
  $q$update guard_probe set managed_status = false, external_employee_id = 'E3'$q$, '23514');
select pg_temp.expect('the refused statements changed nothing',
  (select managed_status and external_employee_id = 'E1' and terminated_at is null and access_revoked_at is null from guard_probe));

-- 4 ------------------------------------------------------------- the privileges
select pg_temp.expect('service_role may update exactly the three flags',
  has_column_privilege('service_role', 'public.employee_account_links', 'managed_status', 'UPDATE')
  and has_column_privilege('service_role', 'public.employee_account_links', 'managed_location', 'UPDATE')
  and has_column_privilege('service_role', 'public.employee_account_links', 'managed_role', 'UPDATE'));

select pg_temp.expect('service_role may not update any other column',
  not exists (
    select 1 from pg_attribute a
     where a.attrelid = 'public.employee_account_links'::regclass and a.attnum > 0 and not a.attisdropped
       and a.attname not in ('managed_status', 'managed_location', 'managed_role')
       and has_column_privilege('service_role', 'public.employee_account_links', a.attname, 'UPDATE')));

select pg_temp.expect('service_role has no table-level UPDATE, DELETE or TRUNCATE on the links',
  not has_table_privilege('service_role', 'public.employee_account_links', 'UPDATE')
  and not has_table_privilege('service_role', 'public.employee_account_links', 'DELETE')
  and not has_table_privilege('service_role', 'public.employee_account_links', 'TRUNCATE'));

select pg_temp.expect('anon and authenticated hold nothing on the links',
  not has_table_privilege('anon', 'public.employee_account_links', 'SELECT')
  and not has_table_privilege('authenticated', 'public.employee_account_links', 'SELECT')
  and not has_table_privilege('anon', 'public.employee_account_links', 'INSERT')
  and not has_table_privilege('authenticated', 'public.employee_account_links', 'UPDATE'));

-- 5 ------------------------------------------------- auth_clear_user_credentials
select pg_temp.expect('auth_clear_user_credentials is security definer with a pinned search_path',
  (select p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=""']
     from pg_proc p where p.oid = to_regprocedure('public.auth_clear_user_credentials(uuid)')));

select pg_temp.expect('auth_clear_user_credentials is executable by service_role only',
  has_function_privilege('service_role', 'public.auth_clear_user_credentials(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.auth_clear_user_credentials(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.auth_clear_user_credentials(uuid)', 'EXECUTE'));

-- 6 ----------------------------------------- the definitions equal the live ones
create function pg_temp.live_hash(p_fn regprocedure) returns text
language sql as $$
  select left(md5(btrim(regexp_replace(regexp_replace(regexp_replace(pg_get_functiondef(p_fn), '/\*.*?\*/', '', 'g'), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))), 8);
$$;

select pg_temp.expect('guard function definition equals the live one (hash measured on the live database 2026-10-19)',
  pg_temp.live_hash('public.employee_account_links_guard_update()'::regprocedure) = 'c2f0c979');
select pg_temp.expect('auth_clear_user_credentials definition equals the live one (hash measured on the live database 2026-10-19)',
  pg_temp.live_hash('public.auth_clear_user_credentials(uuid)'::regprocedure) = '652278b2');

rollback;
