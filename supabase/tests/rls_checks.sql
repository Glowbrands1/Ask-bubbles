-- ============================================================================
-- RLS AND PRIVILEGE CHECKS — run by scripts/db/verify-migrations.sh
-- ============================================================================
--
-- Applied as the cluster superuser against a freshly migrated throwaway
-- database. Each check impersonates a browser role (`anon`, `authenticated`
-- with a JWT `sub`) exactly as PostgREST does, and RAISES on any failure so
-- the harness stops. Everything runs in one transaction that is rolled back.
--
-- What is proven:
--   1. every public table has RLS enabled AND forced
--   2. anon holds no table, view or function privilege in public
--   3. authenticated holds exactly: SELECT on app_users, EXECUTE accept_invitation()
--   4. a signed-in user reads only their own profile (no cross-user read)
--   5. a signed-in user cannot write any profile (no self-elevation via the API)
--   6. the self-elevation trigger refuses a role change even where a write path exists
--   7. every other table is unreadable and unwritable by a signed-in user
--   8. a user with no profile sees nothing
--   9. accept_invitation refuses a disabled account and never changes role
--  10. the last active administrator cannot be demoted or disabled
--  11. storage buckets are private and have no browser policies
--  12. server-only RPCs (reporting, analytics, Woven) are not browser-callable

\set ON_ERROR_STOP 1
begin;

create function pg_temp.expect_denied(p_label text, p_sql text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL [%]: expected permission denied, statement succeeded: %', p_label, p_sql;
exception
  when insufficient_privilege then null;
end;
$$;

create function pg_temp.act_as(p_role text, p_sub uuid) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    case when p_sub is null then json_build_object('role', p_role)::text
         else json_build_object('role', p_role, 'sub', p_sub)::text end,
    true
  );
  perform set_config('request.jwt.claim.role', p_role, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true);
end;
$$;
grant execute on function pg_temp.expect_denied(text, text) to anon, authenticated;
grant execute on function pg_temp.act_as(text, uuid) to anon, authenticated;

-- ------------------------------------------------------------- fixtures ----
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'employee.a@example.test',  now()),
  ('00000000-0000-4000-8000-0000000000b1', 'manager.b@example.test',   now()),
  ('00000000-0000-4000-8000-0000000000d1', 'disabled.d@example.test',  now()),
  ('00000000-0000-4000-8000-0000000000e1', 'invited.e@example.test',   now()),
  ('00000000-0000-4000-8000-0000000000f1', 'admin.f@example.test',     now()),
  ('00000000-0000-4000-8000-0000000000c1', 'noprofile.c@example.test', now());

insert into public.app_users (id, email, display_name, role, status, scope_level, scope_primary_area_id) values
  ('00000000-0000-4000-8000-0000000000a1', 'employee.a@example.test', 'Employee A', 'employee',         'active',   'location', 'loc-001'),
  ('00000000-0000-4000-8000-0000000000b1', 'manager.b@example.test',  'Manager B',  'location_manager', 'active',   'location', 'loc-002'),
  ('00000000-0000-4000-8000-0000000000d1', 'disabled.d@example.test', 'Disabled D', 'location_manager', 'disabled', 'location', 'loc-001'),
  ('00000000-0000-4000-8000-0000000000e1', 'invited.e@example.test',  'Invited E',  'employee',         'invited',  'location', 'loc-001'),
  ('00000000-0000-4000-8000-0000000000f1', 'admin.f@example.test',    'Admin F',    'admin',            'active',   'global',   null);

insert into public.activity_events (actor_user_id, actor_role, feature, category, location_id)
values ('00000000-0000-4000-8000-0000000000b1', 'location_manager', 'chat', 'general_guidance', 'loc-002');

-- ------------------------------------------------ 1. RLS on and forced ----
do $$
declare r record;
begin
  for r in
    select c.relname, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    if not r.relrowsecurity or not r.relforcerowsecurity then
      raise exception 'FAIL [rls-forced]: public.% rls=% force=%', r.relname, r.relrowsecurity, r.relforcerowsecurity;
    end if;
  end loop;
end $$;

-- --------------------------------------- 2/3. the browser privilege map ----
do $$
declare r record;
begin
  for r in
    select c.relname, c.relkind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  loop
    if has_table_privilege('anon', format('public.%I', r.relname), 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') then
      raise exception 'FAIL [anon-grants]: anon holds a privilege on public.%', r.relname;
    end if;
    if r.relname = 'app_users' then
      if has_table_privilege('authenticated', 'public.app_users', 'INSERT, UPDATE, DELETE, TRUNCATE') then
        raise exception 'FAIL [auth-grants]: authenticated may write public.app_users';
      end if;
    elsif has_table_privilege('authenticated', format('public.%I', r.relname), 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') then
      raise exception 'FAIL [auth-grants]: authenticated holds a privilege on public.%', r.relname;
    end if;
  end loop;

  for r in
    select p.oid::regprocedure as fn, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    if has_function_privilege('anon', r.fn, 'EXECUTE') then
      raise exception 'FAIL [anon-exec]: anon may execute %', r.fn;
    end if;
    if r.proname <> 'accept_invitation' and has_function_privilege('authenticated', r.fn, 'EXECUTE') then
      raise exception 'FAIL [auth-exec]: authenticated may execute %', r.fn;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------ 4/5/7. as user A ----
set local role authenticated;
select pg_temp.act_as('authenticated', '00000000-0000-4000-8000-0000000000a1');

do $$
declare n integer; me uuid;
begin
  select count(*), max(id::text)::uuid into n, me from public.app_users;
  if n <> 1 or me <> '00000000-0000-4000-8000-0000000000a1' then
    raise exception 'FAIL [own-profile]: user A sees % profile rows', n;
  end if;
  select count(*) into n from public.app_users where id = '00000000-0000-4000-8000-0000000000b1';
  if n <> 0 then raise exception 'FAIL [cross-user]: user A can read user B''s profile'; end if;
end $$;

select pg_temp.expect_denied('self-elevate-role',
  $q$update public.app_users set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1'$q$);
select pg_temp.expect_denied('self-widen-scope',
  $q$update public.app_users set scope_level = 'global', scope_primary_area_id = null where id = '00000000-0000-4000-8000-0000000000a1'$q$);
select pg_temp.expect_denied('insert-profile',
  $q$insert into public.app_users (id, email, display_name, role, status, scope_level) values ('00000000-0000-4000-8000-0000000000c1', 'x@example.test', 'X', 'owner', 'active', 'global')$q$);
select pg_temp.expect_denied('delete-profile',
  $q$delete from public.app_users where id = '00000000-0000-4000-8000-0000000000f1'$q$);

do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v') and c.relname <> 'app_users'
  loop
    perform pg_temp.expect_denied('read-' || r.relname, format('select 1 from public.%I limit 1', r.relname));
  end loop;
end $$;

select pg_temp.expect_denied('woven-rpc',
  $q$select public.woven_location_map_review('x', 'ignored', null, 'me')$q$);
select pg_temp.expect_denied('reporting-rpc',
  $q$select public.fail_report_ingestion('00000000-0000-4000-8000-000000000000', 'x')$q$);
select pg_temp.expect_denied('analytics-rpc',
  $q$select * from public.analytics_totals(now() - interval '1 day', now())$q$);
select pg_temp.expect_denied('retrieval-rpc',
  $q$select * from public.knowledge_documents$q$);

-- An already-active account accepting again changes nothing.
do $$
declare res jsonb;
begin
  res := public.accept_invitation();
  if (res->>'changed')::boolean then raise exception 'FAIL [accept-active]: %', res; end if;
end $$;

reset role;

-- ------------------------------------------------ 8. no profile, no rows ----
set local role authenticated;
select pg_temp.act_as('authenticated', '00000000-0000-4000-8000-0000000000c1');
do $$
declare n integer;
begin
  select count(*) into n from public.app_users;
  if n <> 0 then raise exception 'FAIL [no-profile]: a user without a profile sees % rows', n; end if;
  begin
    perform public.accept_invitation();
    raise exception 'FAIL [no-profile-accept]: accept_invitation succeeded without a profile';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ------------------------------------------------------------- 8b. anon ----
set local role anon;
select pg_temp.act_as('anon', null);
select pg_temp.expect_denied('anon-profiles', 'select 1 from public.app_users');
select pg_temp.expect_denied('anon-accept', 'select public.accept_invitation()');
select pg_temp.expect_denied('anon-knowledge', 'select 1 from public.knowledge_chunks');
reset role;

-- ------------------------------------------ 9. disabled and invited users ----
set local role authenticated;
select pg_temp.act_as('authenticated', '00000000-0000-4000-8000-0000000000d1');
do $$
begin
  perform public.accept_invitation();
  raise exception 'FAIL [disabled-accept]: a disabled account re-activated itself';
exception when insufficient_privilege then null;
end $$;
select pg_temp.act_as('authenticated', '00000000-0000-4000-8000-0000000000e1');
select public.accept_invitation();
reset role;

do $$
declare d public.app_users; e public.app_users;
begin
  select * into d from public.app_users where id = '00000000-0000-4000-8000-0000000000d1';
  select * into e from public.app_users where id = '00000000-0000-4000-8000-0000000000e1';
  if d.status <> 'disabled' then raise exception 'FAIL [disabled-stays]: %', d.status; end if;
  if e.status <> 'active' or e.role <> 'employee' or e.scope_level <> 'location' then
    raise exception 'FAIL [invited-accept]: status=% role=% scope=%', e.status, e.role, e.scope_level;
  end if;
end $$;

-- -------------------------------- 6. the self-elevation trigger, directly ----
-- `postgres` can write the table; with a user JWT the trigger must still refuse.
set local role postgres;
select pg_temp.act_as('authenticated', '00000000-0000-4000-8000-0000000000a1');
select pg_temp.expect_denied('trigger-self-role',
  $q$update public.app_users set role = 'owner' where id = '00000000-0000-4000-8000-0000000000a1'$q$);
select pg_temp.act_as('authenticated', '00000000-0000-4000-8000-0000000000d1');
select pg_temp.expect_denied('trigger-self-reenable',
  $q$update public.app_users set status = 'active' where id = '00000000-0000-4000-8000-0000000000d1'$q$);
reset role;

-- ------------------------------------------------------ 10. last admin ----
select pg_temp.act_as('service_role', null);
do $$
begin
  update public.app_users set role = 'location_manager' where id = '00000000-0000-4000-8000-0000000000f1';
  raise exception 'FAIL [last-admin]: the last administrator was demoted';
exception when restrict_violation then null;
end $$;
do $$
begin
  update public.app_users set status = 'disabled' where id = '00000000-0000-4000-8000-0000000000f1';
  raise exception 'FAIL [last-admin-disable]: the last administrator was disabled';
exception when restrict_violation then null;
end $$;

-- ------------------------------------------------------------ 11. storage ----
do $$
declare n integer;
begin
  select count(*) into n from storage.buckets where public;
  if n <> 0 then raise exception 'FAIL [buckets-private]: % public bucket(s)', n; end if;
  select count(*) into n from pg_policies
   where schemaname = 'storage' and (roles && array['anon', 'authenticated', 'public']::name[]);
  if n <> 0 then raise exception 'FAIL [storage-policies]: % browser storage policies', n; end if;
end $$;

rollback;
\echo 'rls_checks: all checks passed'
