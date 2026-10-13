-- ============================================================================
-- APP SWITCHER GRANT CHECKS — run by scripts/db/verify-migrations.sh
-- ============================================================================
-- Proves, against the fully migrated throwaway cluster:
--   1. the column defaults to false and the migration grants nobody anything
--   2. a signed-in user reads their OWN flag and nobody else's
--   3. a signed-in user cannot change it — own row or another's — by UPDATE,
--      INSERT or DELETE (privilege + the guard trigger)
--   4. an operator / server (no JWT sub) can set it
--   5. a user with no profile, a disabled user and anon read no flag
--   6. the operator grant script is idempotent and grants exactly the two intended
--      accounts (its refusal paths are exercised separately; they abort psql)
--
-- Run from the repository root (it \i's supabase/ops/app-switcher-grant.sql).
\set ON_ERROR_STOP 1
begin;

create function pg_temp.act_as(p_role text, p_sub uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when p_sub is null then '' else json_build_object('sub', p_sub, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
end;
$$;
grant execute on function pg_temp.act_as(text, uuid) to anon, authenticated;

create function pg_temp.denied(p_label text, p_sql text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL [%]: statement succeeded but must be refused: %', p_label, p_sql;
exception when insufficient_privilege then null;
end;
$$;
grant execute on function pg_temp.denied(text, text) to anon, authenticated;

create function pg_temp.operator() returns void
language plpgsql as $$
begin
  -- Back to the operator: drop the impersonated role AND the JWT claims, which
  -- `set_config(..., true)` would otherwise leave behind for the transaction.
  reset role;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- fixtures (as superuser; no JWT, so the guard allows it)
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'dj.wade@glowbrands.com', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'colene.schildt@glowbrands.com', now()),
  ('00000000-0000-0000-0000-0000000000a3', 'someone.else@glowbrands.com', now()),
  ('00000000-0000-0000-0000-0000000000a4', 'admin@glowbrands.com', now()),
  ('00000000-0000-0000-0000-0000000000a5', 'disabled.mgr@glowbrands.com', now()),
  ('00000000-0000-0000-0000-0000000000a6', 'noprofile@glowbrands.com', now());

insert into public.app_users (id, email, display_name, role, status, scope_level, scope_primary_area_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'DJ.Wade@glowbrands.com', 'DJ', 'regional_manager', 'active', 'region', 'reg-test'),
  ('00000000-0000-0000-0000-0000000000a2', 'Colene.Schildt@glowbrands.com', 'Colene', 'district_manager', 'active', 'district', 'dist-test'),
  ('00000000-0000-0000-0000-0000000000a3', 'someone.else@glowbrands.com', 'Else', 'district_manager', 'active', 'district', 'dist-test'),
  ('00000000-0000-0000-0000-0000000000a4', 'admin@glowbrands.com', 'Admin', 'admin', 'active', 'global', null),
  ('00000000-0000-0000-0000-0000000000a5', 'disabled.mgr@glowbrands.com', 'Dis', 'district_manager', 'disabled', 'district', 'dist-test');

-- 1. default false for everybody
do $$ begin
  if exists (select 1 from public.app_users where can_switch_apps) then
    raise exception 'FAIL [default]: a row holds can_switch_apps before any grant';
  end if;
end $$;

-- 6a. operator grant: idempotent, exactly two, runs twice
\i supabase/ops/app-switcher-grant.sql
\i supabase/ops/app-switcher-grant.sql
do $$ begin
  if (select count(*) from public.app_users where can_switch_apps) <> 2 then
    raise exception 'FAIL [ops-grant]: expected exactly 2 granted';
  end if;
  if exists (select 1 from public.app_users where can_switch_apps and lower(email) not in ('dj.wade@glowbrands.com','colene.schildt@glowbrands.com')) then
    raise exception 'FAIL [ops-grant]: an unrelated account was granted';
  end if;
end $$;

-- 2. a user reads only their own flag
select pg_temp.act_as('authenticated', '00000000-0000-0000-0000-0000000000a1');
do $$ declare n int; own boolean; begin
  select count(*) into n from public.app_users;
  if n <> 1 then raise exception 'FAIL [read-own]: saw % rows', n; end if;
  select can_switch_apps into own from public.app_users where id = '00000000-0000-0000-0000-0000000000a1';
  if own is distinct from true then raise exception 'FAIL [read-own]: DJ should read true'; end if;
  if exists (select 1 from public.app_users where id = '00000000-0000-0000-0000-0000000000a2') then
    raise exception 'FAIL [read-other]: DJ read Colene''s row';
  end if;
end $$;

-- 3. no browser write path to the flag (own row, other row, insert, delete)
select pg_temp.denied('self-update', $q$update public.app_users set can_switch_apps = false where id = '00000000-0000-0000-0000-0000000000a1'$q$);
select pg_temp.denied('other-update', $q$update public.app_users set can_switch_apps = true where id = '00000000-0000-0000-0000-0000000000a3'$q$);
select pg_temp.denied('insert', $q$insert into public.app_users (id,email,display_name,role,status,can_switch_apps) values (gen_random_uuid(),'x@y.z','x','employee','active',true)$q$);
select pg_temp.denied('delete', $q$delete from public.app_users where id = '00000000-0000-0000-0000-0000000000a1'$q$);
select pg_temp.operator();

-- 3b. the guard trigger holds even if a write privilege + policy were added later
grant update on public.app_users to authenticated;
create policy tmp_self_update on public.app_users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
select pg_temp.act_as('authenticated', '00000000-0000-0000-0000-0000000000a3');
select pg_temp.denied('trigger-self-grant', $q$update public.app_users set can_switch_apps = true where id = '00000000-0000-0000-0000-0000000000a3'$q$);
select pg_temp.operator();
drop policy tmp_self_update on public.app_users;
revoke update on public.app_users from authenticated;
do $$ begin
  if (select can_switch_apps from public.app_users where id='00000000-0000-0000-0000-0000000000a3') then
    raise exception 'FAIL [trigger-self-grant]: unrelated user ended up granted';
  end if;
end $$;

-- 4. operator can revoke and re-grant (no JWT sub)
update public.app_users set can_switch_apps = false where id = '00000000-0000-0000-0000-0000000000a1';
\i supabase/ops/app-switcher-grant.sql

-- 5. no profile / disabled / anon read no flag
select pg_temp.act_as('authenticated', '00000000-0000-0000-0000-0000000000a6');
do $$ begin
  if exists (select 1 from public.app_users) then raise exception 'FAIL [no-profile]: a profile-less user read rows'; end if;
end $$;
select pg_temp.operator();
select pg_temp.act_as('authenticated', '00000000-0000-0000-0000-0000000000a5');
do $$ begin
  -- a disabled user can read their own row; the app refuses the profile (status), and the grant read adds status='active'.
  if (select can_switch_apps from public.app_users where id='00000000-0000-0000-0000-0000000000a5') then
    raise exception 'FAIL [disabled]: disabled user holds the flag';
  end if;
end $$;
select pg_temp.operator();
select pg_temp.act_as('anon', null);
do $$ declare n int; begin
  -- Either refused outright (the local cluster, where anon holds no privilege) or
  -- zero rows (a project where anon still holds SELECT but no policy admits it).
  begin
    select count(*) into n from public.app_users;
    if n <> 0 then raise exception 'FAIL [anon]: anon read % rows', n; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.operator();

rollback;
\echo app_switcher_grant_checks: all passed
