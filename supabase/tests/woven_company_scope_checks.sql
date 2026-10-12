-- ============================================================================
-- WOVEN COMPANY SCOPE CHECKS — run by scripts/db/verify-migrations.sh
-- ============================================================================
--
-- Applied as the cluster superuser against a freshly migrated throwaway
-- database, after every migration. RAISES on the first failure so the harness
-- stops. Everything runs in one transaction that is rolled back.
--
-- What is proven (20261012001000_woven_employee_company_scope.sql):
--   1. the three scoped columns are NOT NULL with a pinned-company CHECK; only
--      the run table has a default, so a directory or map writer must state it
--   2. a claimed run is a Midwest Soap Makers run
--   3. a commit that states no company, a malformed one, another company, or
--      the pinned one in a different case than stored still writes only when
--      it is the pinned company — and a refused commit writes NOTHING (no
--      directory row, affiliation, change, location or position) and leaves
--      the run `running` for the caller to abandon
--   4. a good commit stamps the pinned company on every directory and map row
--   5. a direct write naming another company, or none, is refused by the table
--   6. a run cannot be moved to another company
--   7. the commit function is still not callable by a browser role

\set ON_ERROR_STOP 1
begin;

create function pg_temp.expect_error(p_label text, p_sql text, p_state text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'COMPANY SCOPE CHECK FAILED (%): the statement succeeded', p_label;
exception
  when others then
    if sqlstate = 'P0001' and sqlerrm like 'COMPANY SCOPE CHECK FAILED%' then raise; end if;
    if sqlstate <> p_state then
      raise exception 'COMPANY SCOPE CHECK FAILED (%): expected SQLSTATE %, got % (%)', p_label, p_state, sqlstate, sqlerrm;
    end if;
end;
$$;

create function pg_temp.saved_rows() returns bigint
language sql as $$
  select (select count(*) from public.employee_access_directory)
       + (select count(*) from public.employee_location_affiliations)
       + (select count(*) from public.employee_directory_changes)
       + (select count(*) from public.woven_location_map)
       + (select count(*) from public.woven_position_map);
$$;

-- 1. the columns
do $$
declare
  r record;
begin
  for r in
    select c.table_name, c.is_nullable, c.column_default, c.data_type
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.column_name = 'woven_company_id'
       and c.table_name in ('employee_sync_runs', 'employee_access_directory', 'woven_location_map')
  loop
    if r.is_nullable <> 'NO' or r.data_type <> 'uuid' then
      raise exception 'COMPANY SCOPE CHECK FAILED (column %): must be uuid NOT NULL', r.table_name;
    end if;
    if r.table_name = 'employee_sync_runs' and r.column_default not like '%55839f24-9241-418c-8405-37baf9a42a87%' then
      raise exception 'COMPANY SCOPE CHECK FAILED (column %): default must be the pinned company', r.table_name;
    end if;
    if r.table_name <> 'employee_sync_runs' and r.column_default is not null then
      raise exception 'COMPANY SCOPE CHECK FAILED (column %): must have no default', r.table_name;
    end if;
  end loop;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and column_name = 'woven_company_id'
         and table_name in ('employee_sync_runs', 'employee_access_directory', 'woven_location_map')) <> 3 then
    raise exception 'COMPANY SCOPE CHECK FAILED (columns): expected exactly three scoped tables';
  end if;
  if (select count(*) from pg_constraint
       where conname in ('employee_sync_runs_pinned_company',
                         'employee_access_directory_pinned_company',
                         'woven_location_map_pinned_company')
         and contype = 'c' and convalidated) <> 3 then
    raise exception 'COMPANY SCOPE CHECK FAILED (constraints): expected three validated pinned-company CHECKs';
  end if;
end;
$$;

-- 2. a claimed run
create temp table run_under_test as
select (public.employee_sync_claim_run('cron') ->> 'runId')::uuid as id;

do $$
begin
  if (select r.woven_company_id from public.employee_sync_runs r join run_under_test t on t.id = r.id)
     is distinct from '55839f24-9241-418c-8405-37baf9a42a87'::uuid then
    raise exception 'COMPANY SCOPE CHECK FAILED (claim): a claimed run must be a Midwest Soap Makers run';
  end if;
end;
$$;

-- 3. refused commits write nothing
create temp table payload as
select
  jsonb_build_array(jsonb_build_object(
    'external_employee_id', 'scope-check-1',
    'employment_status', 'active',
    'position_id', 'POS-CHECK',
    'primary_woven_location_id', 'WL-CHECK',
    'affiliations', jsonb_build_array(jsonb_build_object(
      'woven_location_id', 'WL-CHECK', 'access_type', 'primary')),
    'data_issues', '{}'::text[],
    'record_hash', repeat('a', 64)
  )) as employees,
  jsonb_build_array(jsonb_build_object(
    'external_employee_id', 'scope-check-1',
    'change_kind', 'new_employee',
    'classification', 'initial_load'
  )) as changes,
  jsonb_build_array(jsonb_build_object('woven_location_id', 'WL-CHECK', 'woven_location_name', 'Check')) as locations;

do $$
declare
  v_run uuid := (select id from run_under_test);
  v_bad jsonb;
begin
  foreach v_bad in array array[
    '{}'::jsonb,                                                       -- no company stated
    '{"woven_company_id": null}'::jsonb,                               -- null
    '{"woven_company_id": "Midwest Soap Makers"}'::jsonb,              -- not a GUID
    '{"woven_company_id": "00000000-0000-0000-0000-000000000000"}'::jsonb,
    '{"woven_company_id": "1ba00000-0000-4000-8000-0000000000aa"}'::jsonb  -- another company
  ] loop
    begin
      perform public.employee_sync_commit_run(
        v_run, (select employees from payload), (select changes from payload), (select locations from payload), v_bad);
      raise exception 'COMPANY SCOPE CHECK FAILED (commit %): a commit without the pinned company was saved', v_bad;
    exception
      when check_violation then
        if sqlerrm not like '%company_scope_violation%' then
          raise exception 'COMPANY SCOPE CHECK FAILED (commit %): refused for the wrong reason: %', v_bad, sqlerrm;
        end if;
    end;
    if pg_temp.saved_rows() <> 0 then
      raise exception 'COMPANY SCOPE CHECK FAILED (commit %): a refused commit left rows behind', v_bad;
    end if;
    if (select status from public.employee_sync_runs where id = v_run) <> 'running' then
      raise exception 'COMPANY SCOPE CHECK FAILED (commit %): a refused commit must leave the run running', v_bad;
    end if;
  end loop;
end;
$$;

-- 4. a good commit (stated in upper case, as the pinned constant is written in code) stamps every row
do $$
declare
  v_run uuid := (select id from run_under_test);
  v_result jsonb;
begin
  v_result := public.employee_sync_commit_run(
    v_run, (select employees from payload), (select changes from payload), (select locations from payload),
    '{"woven_company_id": "55839F24-9241-418C-8405-37BAF9A42A87"}'::jsonb);
  if v_result ->> 'status' <> 'committed' then
    raise exception 'COMPANY SCOPE CHECK FAILED (good commit): %', v_result;
  end if;
  if exists (select 1 from public.employee_access_directory
              where woven_company_id <> '55839f24-9241-418c-8405-37baf9a42a87')
     or exists (select 1 from public.woven_location_map
              where woven_company_id <> '55839f24-9241-418c-8405-37baf9a42a87')
     or (select count(*) from public.employee_access_directory) <> 1
     or (select count(*) from public.woven_location_map) <> 1
     or (select count(*) from public.employee_location_affiliations) <> 1 then
    raise exception 'COMPANY SCOPE CHECK FAILED (good commit): rows not written or not stamped with the pinned company';
  end if;
end;
$$;

-- 4b. a second run stating the pinned company commits again (idempotent upsert keeps the company)
do $$
declare
  v_run uuid;
begin
  update public.employee_sync_runs set status = 'succeeded', finished_at = coalesce(finished_at, now())
   where id = (select id from run_under_test) and status = 'running';
  v_run := (public.employee_sync_claim_run('cron') ->> 'runId')::uuid;
  if (public.employee_sync_commit_run(v_run, (select employees from payload), '[]'::jsonb, (select locations from payload),
        '{"woven_company_id": "55839f24-9241-418c-8405-37baf9a42a87"}'::jsonb) ->> 'status') <> 'committed' then
    raise exception 'COMPANY SCOPE CHECK FAILED (second commit)';
  end if;
end;
$$;

-- 5. direct writes naming another company, or none
select pg_temp.expect_error('directory: another company',
  $q$insert into public.employee_access_directory (source_system, external_employee_id, record_hash, woven_company_id)
     values ('woven', 'scope-check-2', repeat('b', 64), '1ba00000-0000-4000-8000-0000000000aa')$q$, '23514');
select pg_temp.expect_error('directory: no company',
  $q$insert into public.employee_access_directory (source_system, external_employee_id, record_hash)
     values ('woven', 'scope-check-3', repeat('c', 64))$q$, '23502');
select pg_temp.expect_error('directory: moved to another company',
  $q$update public.employee_access_directory set woven_company_id = '1ba00000-0000-4000-8000-0000000000aa'$q$, '23514');
select pg_temp.expect_error('location map: another company',
  $q$insert into public.woven_location_map (woven_location_id, woven_company_id)
     values ('WL-OTHER', '1ba00000-0000-4000-8000-0000000000aa')$q$, '23514');
select pg_temp.expect_error('location map: no company',
  $q$insert into public.woven_location_map (woven_location_id) values ('WL-NONE')$q$, '23502');

-- 6. a run cannot be moved to another company, or stripped of it
select pg_temp.expect_error('run: another company',
  $q$update public.employee_sync_runs set woven_company_id = '1ba00000-0000-4000-8000-0000000000aa'$q$, '23514');
select pg_temp.expect_error('run: no company',
  $q$update public.employee_sync_runs set woven_company_id = null$q$, '23502');

-- 7. still server-only
do $$
begin
  if has_function_privilege('anon', 'public.employee_sync_commit_run(uuid, jsonb, jsonb, jsonb, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.employee_sync_commit_run(uuid, jsonb, jsonb, jsonb, jsonb)', 'execute') then
    raise exception 'COMPANY SCOPE CHECK FAILED (privileges): the commit function is callable by a browser role';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('employee_sync_runs', 'employee_access_directory', 'woven_location_map')
       and not (c.relrowsecurity and c.relforcerowsecurity)
  ) then
    raise exception 'COMPANY SCOPE CHECK FAILED (RLS): a scoped table lost enabled+forced RLS';
  end if;
end;
$$;

rollback;
