-- ============================================================================
-- WOVEN TERMINATION ENFORCEMENT CHECKS — run by scripts/db/verify-migrations.sh
-- ============================================================================
--
-- Applied as the cluster superuser against a freshly migrated THROWAWAY
-- database, after every migration. RAISES on the first failure so the harness
-- stops. One transaction, rolled back. Never run against a real project.
--
-- Proves (20261019001000_woven_disable_terminated_apply.sql):
--   1. success path: profile disabled, link stamped, audit rows, revocation record
--   2. each disable refusal by its short code, nothing changed: company scope
--      (stated, directory row, latest run, no company), unlinked, link method
--      (override_backfill, unmatched_backfill, provisioned), link not approved
--      by a person, managed_status off, protected accounts (admin, owner,
--      developer, district_manager, regional_manager, role override, an id on
--      the app-switcher list the server passes; the list itself is required),
--      not Terminated in the latest read, latest sync not succeeded
--   3. the SHADOW-REVIEW GATE: no shadow run, guard-tripped run, stale run, no
--      review, review of an older run, reviewer no longer an administrator,
--      employee not on the reviewed list; and the review's own refusals
--   4. idempotence: a second disable is `already_disabled`; completing a
--      started revocation needs no new review
--   5. REHIRE: only an active administrator, with a reason, for a confirmed
--      link revoked by enforcement whose employee is Active in the latest read
--      of the pinned company; two phases, a failed ban lift reverts and is
--      retryable, a crash between phases resumes, a repeat is a no-op, audit
--      rows name the approver and reason; nothing re-enables on its own
--   6. the apply-run record: a run with a failed account is never `completed`
--   7. privileges: anon / authenticated / PUBLIC cannot EXECUTE; service_role can

\set ON_ERROR_STOP 1
begin;

create function pg_temp.expect_code(p_label text, p_sql text, p_code text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ENFORCEMENT CHECK FAILED (%): the call succeeded', p_label;
exception
  when others then
    if sqlerrm like 'ENFORCEMENT CHECK FAILED%' then raise; end if;
    if sqlerrm <> p_code then
      raise exception 'ENFORCEMENT CHECK FAILED (%): expected "%", got "%" (%)', p_label, p_code, sqlerrm, sqlstate;
    end if;
end;
$$;

create function pg_temp.assert(p_label text, p_ok boolean) returns void
language plpgsql as $$
begin
  if p_ok is not true then raise exception 'ENFORCEMENT CHECK FAILED (%)', p_label; end if;
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
  p_company uuid default '55839f24-9241-418c-8405-37baf9a42a87',
  p_set_by text default 'admin:reviewer@example.test'
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
    values (v_id, 'woven_linked', v_emp, p_method, p_managed, p_set_by);
  end if;
  return v_id;
end;
$$;

create function pg_temp.prot() returns uuid[] language sql as $$
  select array['4979fa8a-09ae-4b89-ad54-054be3acf6ba', '4f085a07-4e36-4ff0-a482-4dfba828b235']::uuid[];
$$;

create function pg_temp.disable(
  p_user uuid, p_emp text,
  p_company uuid default '55839f24-9241-418c-8405-37baf9a42a87',
  p_review uuid default null,
  p_protected uuid[] default pg_temp.prot()
) returns text
language sql as $$
  select public.employee_access_disable_terminated(p_user, p_emp, p_company, p_review, p_protected, 'woven-termination:check');
$$;

/* The review the gate currently reports (null when the gate is closed). */
create function pg_temp.review_id() returns uuid language sql as $$
  select (public.employee_access_review_state() ->> 'review_id')::uuid;
$$;

create function pg_temp.gate_code() returns text language sql as $$
  select public.employee_access_review_state() ->> 'code';
$$;

create function pg_temp.untouched(p_user uuid) returns boolean
language sql as $$
  select (select status::text from public.app_users where id = p_user) <> 'disabled'
     and not exists (select 1 from public.app_user_audit where target_user_id = p_user)
     and not exists (select 1 from public.employee_account_links where app_user_id = p_user and terminated_at is not null);
$$;

/* A shadow run `p_age` old, with a DISABLE_TERMINATED action for each id. */
create function pg_temp.mk_shadow(p_age interval, p_status text, p_guards text[], p_ids text[]) returns uuid
language plpgsql as $$
declare v_run uuid; v_id text;
begin
  insert into public.employee_access_runs (mode, requested_by, policy_version, status, guard_codes, created_at)
  values ('shadow', 'check', 'access-policy-1', p_status, p_guards, now() - p_age) returning id into v_run;
  foreach v_id in array p_ids loop
    insert into public.employee_access_actions (access_run_id, external_employee_id, action, is_primary, result)
    values (v_run, v_id, 'DISABLE_TERMINATED', true, 'shadow');
  end loop;
  return v_run;
end;
$$;

create function pg_temp.review(
  p_run uuid, p_reviewer uuid, p_ids text[],
  p_reason text default 'checked against HR',
  p_company uuid default '55839f24-9241-418c-8405-37baf9a42a87'
) returns uuid
language sql as $$
  select public.employee_access_record_shadow_review(p_run, p_reviewer, p_ids, public.employee_access_ids_hash(p_ids), p_company, p_reason);
$$;

-- two administrators (so one can be demoted without tripping the last-admin guard) and a plain manager
create temp table people as
select pg_temp.mk(900, p_role => 'admin', p_link => false, p_status => null) as admin_a,
       pg_temp.mk(901, p_role => 'admin', p_link => false, p_status => null) as admin_b,
       pg_temp.mk(902, p_role => 'location_manager', p_link => false, p_status => null) as manager;

-- a current, pinned-company directory sync: finished, succeeded
insert into public.employee_sync_runs (requested_by, status, started_at, finished_at)
values ('check', 'succeeded', now() - interval '2 hours', now() - interval '119 minutes');

-- ================================================ 2. disable: standing refusals
-- (every one of these is checked BEFORE the review gate, so the gate state does not matter)
create temp table cases (label text, id uuid, emp text, company uuid, protected uuid[], code text);
insert into cases
select 'unlinked account', pg_temp.mk(10, p_link => false), 'EMP10', '55839f24-9241-418c-8405-37baf9a42a87'::uuid, pg_temp.prot(), 'disable_not_linked'
union all select 'override_backfill link', pg_temp.mk(11, p_method => 'override_backfill'), 'EMP11', '55839f24-9241-418c-8405-37baf9a42a87', pg_temp.prot(), 'disable_link_not_confirmed'
union all select 'unmatched_backfill link', pg_temp.mk(12, p_method => 'unmatched_backfill'), 'EMP12', '55839f24-9241-418c-8405-37baf9a42a87', pg_temp.prot(), 'disable_link_not_confirmed'
union all select 'provisioned link', pg_temp.mk(13, p_method => 'provisioned'), 'EMP13', '55839f24-9241-418c-8405-37baf9a42a87', pg_temp.prot(), 'disable_link_not_confirmed'
union all select 'link set by a migration', pg_temp.mk(14, p_set_by => 'migration:20261002002000'), 'EMP14', '55839f24-9241-418c-8405-37baf9a42a87', pg_temp.prot(), 'disable_link_not_approved'
union all select 'managed_status false', pg_temp.mk(15, p_managed => false), 'EMP15', '55839f24-9241-418c-8405-37baf9a42a87', pg_temp.prot(), 'disable_status_not_managed'
union all select 'admin', pg_temp.mk(16, p_role => 'admin'), 'EMP16', '55839f24-9241-418c-8405-37baf9a42a87', pg_temp.prot(), 'disable_protected_account'
union all select 'owner', pg_temp.mk(17, p_role => 'owner'), 'EMP17', '55839f24-9241-418c-8405-37baf9a42a87', pg_temp.prot(), 'disable_protected_account'
union all select 'developer', pg_temp.mk(18, p_role => 'developer'), 'EMP18', '55839f24-9241-418c-8405-37baf9a42a87', pg_temp.prot(), 'disable_protected_account'
union all select 'district_manager', pg_temp.mk(19, p_role => 'district_manager'), 'EMP19', '55839f24-9241-418c-8405-37baf9a42a87', pg_temp.prot(), 'disable_protected_account'
union all select 'regional_manager', pg_temp.mk(20, p_role => 'regional_manager'), 'EMP20', '55839f24-9241-418c-8405-37baf9a42a87', pg_temp.prot(), 'disable_protected_account'
union all select 'active in Woven', pg_temp.mk(21, p_status => 'active'), 'EMP21', '55839f24-9241-418c-8405-37baf9a42a87', pg_temp.prot(), 'disable_not_terminated_in_latest_read'
union all select 'unknown in Woven', pg_temp.mk(22, p_status => 'unknown'), 'EMP22', '55839f24-9241-418c-8405-37baf9a42a87', pg_temp.prot(), 'disable_not_terminated_in_latest_read'
union all select 'wrong stated company', pg_temp.mk(23), 'EMP23', '1ba00000-0000-4000-8000-0000000000aa', pg_temp.prot(), 'disable_company_scope'
union all select 'null stated company', pg_temp.mk(24), 'EMP24', null, pg_temp.prot(), 'disable_company_scope'
union all select 'no directory row', pg_temp.mk(25, p_status => null), 'EMP25', '55839f24-9241-418c-8405-37baf9a42a87', pg_temp.prot(), 'disable_company_scope'
union all select 'protected id list missing', pg_temp.mk(26), 'EMP26', '55839f24-9241-418c-8405-37baf9a42a87', null, 'disable_protected_ids_required'
union all select 'protected id list empty', pg_temp.mk(27), 'EMP27', '55839f24-9241-418c-8405-37baf9a42a87', '{}', 'disable_protected_ids_required';

-- an account whose id is on the app-switcher list the server passes: review-only whatever its role
insert into cases
select 'app-switcher id', pg_temp.mk(28), 'EMP28', '55839f24-9241-418c-8405-37baf9a42a87'::uuid,
       array[('00000000-0000-4000-8000-' || lpad('28', 12, '0'))::uuid, '4f085a07-4e36-4ff0-a482-4dfba828b235']::uuid[], 'disable_protected_account';

-- a link naming a DIFFERENT EmployeeID than the one asked about
create temp table swap as select pg_temp.mk(29) as id;
insert into public.employee_access_directory (source_system, external_employee_id, employment_status, record_hash, woven_company_id)
values ('woven', 'EMP29-B', 'terminated', repeat('b', 64), '55839f24-9241-418c-8405-37baf9a42a87');
insert into cases select 'link names another employee', (select id from swap), 'EMP29-B', '55839f24-9241-418c-8405-37baf9a42a87', pg_temp.prot(), 'disable_not_linked';

-- a role override makes an otherwise ordinary account protected
create temp table ovr as select pg_temp.mk(30) as id;
insert into public.employee_role_overrides (app_user_id, external_employee_id, locked_role, locked_scope_level, reason, set_by)
select id, 'EMP30', 'location_manager', 'location', 'check', 'check' from ovr;
insert into cases select 'role override', (select id from ovr), 'EMP30', '55839f24-9241-418c-8405-37baf9a42a87', pg_temp.prot(), 'disable_protected_account';

-- absent from the latest read (missing_sync_count > 0)
create temp table gone as select pg_temp.mk(31) as id;
update public.employee_access_directory set missing_sync_count = 2 where external_employee_id = 'EMP31';
insert into cases select 'missing from latest read', (select id from gone), 'EMP31', '55839f24-9241-418c-8405-37baf9a42a87', pg_temp.prot(), 'disable_not_terminated_in_latest_read';

do $$
declare r record;
begin
  for r in select * from cases loop
    perform pg_temp.expect_code(r.label,
      format('select pg_temp.disable(%L, %L, %L, null, %L)', r.id, r.emp, r.company, r.protected), r.code);
    perform pg_temp.assert(r.label || ': nothing changed', pg_temp.untouched(r.id));
  end loop;
end;
$$;

-- the hash the server computes (employeeIdsHash in TypeScript) is the one the database computes: sha256 of the sorted ids joined by newlines
do $$
begin
  perform pg_temp.assert('hash parity: one id', public.employee_access_ids_hash(array['a']) = 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb');
  perform pg_temp.assert('hash parity: order and duplicates do not matter', public.employee_access_ids_hash(array['b', 'a', 'a']) = public.employee_access_ids_hash(array['a', 'b']));
  perform pg_temp.assert('hash parity: empty', public.employee_access_ids_hash(array[]::text[]) = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
end;
$$;

-- ======================================================== 3. the shadow-review gate
create temp table s as select pg_temp.mk(40) as id, pg_temp.mk(41) as other, pg_temp.mk(42) as third;

-- no shadow run at all
select pg_temp.expect_code('no shadow run', format('select pg_temp.disable(%L, %L)', (select id from s), 'EMP40'), 'disable_review_no_shadow_run');

-- the newest shadow run tripped a guard
create temp table r_old as select pg_temp.mk_shadow(interval '100 hours', 'aborted', array['directory_sync_stale'], array['EMP40']) as id;
select pg_temp.expect_code('guard-tripped run', format('select pg_temp.disable(%L, %L)', (select id from s), 'EMP40'), 'disable_review_shadow_run_guard_tripped');

-- the newest shadow run is clean but stale (> 48 h)
create temp table r_stale as select pg_temp.mk_shadow(interval '49 hours', 'completed', '{}', array['EMP40']) as id;
select pg_temp.expect_code('stale run', format('select pg_temp.disable(%L, %L)', (select id from s), 'EMP40'), 'disable_review_shadow_run_stale');

-- a fresh clean run, NOT yet reviewed
create temp table r1 as select pg_temp.mk_shadow(interval '3 hours', 'completed', '{}', array['EMP40', 'EMP41']) as id;
select pg_temp.expect_code('no review', format('select pg_temp.disable(%L, %L)', (select id from s), 'EMP40'), 'disable_review_no_review');
do $$ begin perform pg_temp.assert('gate: no_review', pg_temp.gate_code() = 'no_review'); end; $$;

-- the review's own refusals
select pg_temp.expect_code('review: non-admin reviewer',
  format('select pg_temp.review(%L, %L, array[''EMP40''])', (select id from r1), (select manager from people)), 'review_reviewer_not_admin');
select pg_temp.expect_code('review: no reason',
  format('select pg_temp.review(%L, %L, array[''EMP40''], %L)', (select id from r1), (select admin_a from people), '   '), 'review_reason_required');
select pg_temp.expect_code('review: hash mismatch',
  format('select public.employee_access_record_shadow_review(%L, %L, array[''EMP40''], repeat(''0'', 64), %L, ''x'')', (select id from r1), (select admin_a from people), '55839f24-9241-418c-8405-37baf9a42a87'),
  'review_hash_mismatch');
select pg_temp.expect_code('review: id the run never planned',
  format('select pg_temp.review(%L, %L, array[''EMP40'', ''EMP42''])', (select id from r1), (select admin_a from people)), 'review_unlisted_employee');
select pg_temp.expect_code('review: no ids',
  format('select pg_temp.review(%L, %L, array[]::text[])', (select id from r1), (select admin_a from people)), 'review_no_employees');
select pg_temp.expect_code('review: not the newest run',
  format('select pg_temp.review(%L, %L, array[''EMP40''])', (select id from r_stale), (select admin_a from people)), 'review_not_latest_run');
select pg_temp.expect_code('review: wrong stated company',
  format('select pg_temp.review(%L, %L, array[''EMP40''], ''ok'', %L)', (select id from r1), (select admin_a from people), '1ba00000-0000-4000-8000-0000000000aa'), 'review_company_scope');
select pg_temp.expect_code('review: unknown run',
  format('select pg_temp.review(%L, %L, array[''EMP40''])', '99999999-9999-4999-8999-999999999999', (select admin_a from people)), 'review_run_not_found');
do $$ begin perform pg_temp.assert('gate still no_review', pg_temp.gate_code() = 'no_review'); end; $$;

-- the review (approves EMP40 and EMP41 only)
create temp table rev as select pg_temp.review((select id from r1), (select admin_a from people), array['EMP40', 'EMP41']) as id;
do $$
begin
  perform pg_temp.assert('gate open', (public.employee_access_review_state() ->> 'ok')::boolean);
  perform pg_temp.assert('review row names run, reviewer, ids and hash',
    (select shadow_run_id = (select id from r1) and reviewed_by = (select admin_a from people)
        and approved_employee_ids = array['EMP40', 'EMP41']
        and approved_ids_sha256 = public.employee_access_ids_hash(array['EMP40', 'EMP41'])
        and reason = 'checked against HR'
       from public.employee_access_shadow_reviews where id = (select id from rev)));
end;
$$;

-- an employee not on the reviewed list, and the wrong review id
create temp table off_list as select pg_temp.mk(43) as id;
insert into public.employee_access_actions (access_run_id, external_employee_id, action, is_primary, result)
select (select id from r1), 'EMP43', 'DISABLE_TERMINATED', true, 'shadow';
select pg_temp.expect_code('not on the reviewed list',
  format('select pg_temp.disable(%L, %L, p_review => %L)', (select id from off_list), 'EMP43', (select id from rev)), 'disable_not_in_reviewed_list');
select pg_temp.expect_code('a review id that is not the open one',
  format('select pg_temp.disable(%L, %L, p_review => %L)', (select id from s), 'EMP40', '99999999-9999-4999-8999-999999999999'), 'disable_review_not_the_open_review');
do $$ begin perform pg_temp.assert('off-list: nothing changed', pg_temp.untouched((select id from off_list))); end; $$;

-- ===================================================================== 1. success
do $$
declare
  v_id uuid := (select id from s);
begin
  perform pg_temp.assert('success returns disabled', pg_temp.disable(v_id, 'EMP40', p_review => (select id from rev)) = 'disabled');
  perform pg_temp.assert('profile disabled', (select status::text from public.app_users where id = v_id) = 'disabled');
  perform pg_temp.assert('link stamped terminated, not yet revoked',
    (select terminated_at is not null and reactivated_at is null and revoked_woven_status = 'terminated' and access_revoked_at is null
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

  -- 4. idempotent: second call = no action, no second status row
  perform pg_temp.assert('second call already_disabled', pg_temp.disable(v_id, 'EMP40', p_review => (select id from rev)) = 'already_disabled');
  perform pg_temp.assert('no second status audit row',
    (select count(*) from public.app_user_audit where target_user_id = v_id and action = 'status_changed') = 1);
  perform pg_temp.assert('never enabled by this path', (select count(*) from public.app_user_audit where target_user_id = v_id and to_value = 'active') = 0);
end;
$$;

-- an incomplete revocation is audited but does NOT stamp access_revoked_at; the retry needs NO new review
create temp table half as select id from s;  -- placeholder replaced below
drop table half;
create temp table half as select (select other from s) as id;
do $$
declare v_id uuid := (select id from half);
begin
  perform pg_temp.disable(v_id, 'EMP41', p_review => (select id from rev));
  perform public.employee_access_record_revocation(v_id, false, 'failed:sessions', 'woven-termination:check');
  perform pg_temp.assert('incomplete: not stamped', (select access_revoked_at is null from public.employee_account_links where app_user_id = v_id));
  perform pg_temp.assert('incomplete: audited',
    (select count(*) from public.app_user_audit where target_user_id = v_id and action = 'access_revocation_incomplete') = 1);
end;
$$;

-- ... a NEWER shadow run reopens the gate for new work (the review was of the older run)...
create temp table r2 as select pg_temp.mk_shadow(interval '1 hour', 'completed', '{}', array['EMP42']) as id;
do $$ begin perform pg_temp.assert('gate: review_outdated', pg_temp.gate_code() = 'review_outdated'); end; $$;
select pg_temp.expect_code('newer shadow run than the reviewed one',
  format('select pg_temp.disable(%L, %L, p_review => %L)', (select third from s), 'EMP42', (select id from rev)), 'disable_review_review_outdated');
-- ... but finishing the revocation already started still works, with the gate closed
do $$
declare v_id uuid := (select id from half);
begin
  perform pg_temp.assert('completion without a review', pg_temp.disable(v_id, 'EMP41') = 'already_disabled');
  perform public.employee_access_record_revocation(v_id, true, 'auth_ban,sessions_revoked', 'woven-termination:check');
  perform pg_temp.assert('completion stamped', (select access_revoked_at is not null from public.employee_account_links where app_user_id = v_id));
end;
$$;

-- a reviewer who is no longer an administrator closes the gate
create temp table rev2 as select pg_temp.review((select id from r2), (select admin_b from people), array['EMP42']) as id;
do $$ begin perform pg_temp.assert('gate reopened by a review of the newest run', (public.employee_access_review_state() ->> 'ok')::boolean); end; $$;
update public.app_users set status = 'disabled' where id = (select admin_b from people);
do $$ begin perform pg_temp.assert('gate: reviewer_not_admin', pg_temp.gate_code() = 'reviewer_not_admin'); end; $$;
select pg_temp.expect_code('reviewer demoted',
  format('select pg_temp.disable(%L, %L, p_review => %L)', (select third from s), 'EMP42', (select id from rev2)), 'disable_review_reviewer_not_admin');
update public.app_users set status = 'active' where id = (select admin_b from people);
do $$ begin perform pg_temp.assert('gate back', (public.employee_access_review_state() ->> 'ok')::boolean); end; $$;

-- directory-level refusals under an OPEN gate
create temp table fresh as select pg_temp.mk(50) as id;
insert into public.employee_access_actions (access_run_id, external_employee_id, action, is_primary, result) select (select id from r2), 'EMP50', 'DISABLE_TERMINATED', true, 'shadow';
-- (EMP50 is not on rev2's list; the directory checks below fire first)
-- directory row of ANOTHER company / with NO company (the table CHECK/NOT NULL are lifted inside this
-- rolled-back transaction only, to prove the function does not rely on them)
alter table public.employee_access_directory drop constraint employee_access_directory_pinned_company;
alter table public.employee_access_directory alter column woven_company_id drop not null;
create temp table foreign_row as select pg_temp.mk(51, p_company => '1ba00000-0000-4000-8000-0000000000aa') as id;
create temp table null_row as select pg_temp.mk(52, p_company => null) as id;
select pg_temp.expect_code('directory row of another company',
  format('select pg_temp.disable(%L, %L)', (select id from foreign_row), 'EMP51'), 'disable_company_scope');
select pg_temp.expect_code('directory row without a company',
  format('select pg_temp.disable(%L, %L)', (select id from null_row), 'EMP52'), 'disable_company_scope');
select pg_temp.expect_code('review: directory row of another company',
  format('select pg_temp.review(%L, %L, array[''EMP51''])', (select id from r2), (select admin_a from people)), 'review_unlisted_employee');
insert into public.employee_access_actions (access_run_id, external_employee_id, action, is_primary, result) select (select id from r2), 'EMP51', 'DISABLE_TERMINATED', true, 'shadow';
select pg_temp.expect_code('review: directory row of another company (planned)',
  format('select pg_temp.review(%L, %L, array[''EMP51''])', (select id from r2), (select admin_a from people)), 'review_company_scope');
do $$
begin
  perform pg_temp.assert('foreign row: nothing changed', pg_temp.untouched((select id from foreign_row)));
  perform pg_temp.assert('null-company row: nothing changed', pg_temp.untouched((select id from null_row)));
end;
$$;

-- latest sync run of ANOTHER company, then with the latest run failed
alter table public.employee_sync_runs drop constraint employee_sync_runs_pinned_company;
insert into public.employee_sync_runs (requested_by, status, started_at, finished_at, woven_company_id)
values ('check', 'succeeded', now() - interval '1 hour', now() - interval '59 minutes', '1ba00000-0000-4000-8000-0000000000aa');
select pg_temp.expect_code('latest run of another company',
  format('select pg_temp.disable(%L, %L, p_review => %L)', (select third from s), 'EMP42', (select id from rev2)), 'disable_directory_not_current');
select pg_temp.expect_code('review: latest run of another company',
  format('select pg_temp.review(%L, %L, array[''EMP42''])', (select id from r2), (select admin_a from people)), 'review_company_scope');
insert into public.employee_sync_runs (requested_by, status, started_at, finished_at, error_code, woven_company_id)
values ('check', 'failed', now() - interval '30 minutes', now() - interval '29 minutes', 'woven_unreachable', '55839f24-9241-418c-8405-37baf9a42a87');
select pg_temp.expect_code('latest run failed',
  format('select pg_temp.disable(%L, %L, p_review => %L)', (select third from s), 'EMP42', (select id from rev2)), 'disable_directory_not_current');
do $$ begin perform pg_temp.assert('directory refusals: nothing changed', pg_temp.untouched((select third from s))); end; $$;

-- ================================================================ 5. REHIRE
-- A fresh, current directory sync for the rehire cases (and EMP40 comes back Active in Woven).
insert into public.employee_sync_runs (requested_by, status, started_at, finished_at)
values ('check', 'succeeded', now() - interval '5 minutes', now() - interval '4 minutes');
do $$
declare
  v_id uuid := (select id from s);
  v_a  uuid := (select admin_a from people);
begin
  -- Woven still says Terminated: refused
  perform pg_temp.assert('precondition', (select terminated_at is not null and access_revoked_at is not null from public.employee_account_links where app_user_id = v_id));
end;
$$;
create function pg_temp.rehire(p_user uuid, p_emp text, p_approver uuid, p_reason text default 'rehired, confirmed with HR',
  p_company uuid default '55839f24-9241-418c-8405-37baf9a42a87') returns text
language sql as $$
  select public.employee_access_approve_rehire(p_user, p_emp, p_company, p_approver, p_reason);
$$;

select pg_temp.expect_code('rehire: still Terminated in Woven',
  format('select pg_temp.rehire(%L, %L, %L)', (select id from s), 'EMP40', (select admin_a from people)), 'rehire_not_active_in_latest_read');
update public.employee_access_directory set employment_status = 'active' where external_employee_id in ('EMP40', 'EMP41');

select pg_temp.expect_code('rehire: approver is not an administrator',
  format('select pg_temp.rehire(%L, %L, %L)', (select id from s), 'EMP40', (select manager from people)), 'rehire_approver_not_admin');
select pg_temp.expect_code('rehire: approver unknown',
  format('select pg_temp.rehire(%L, %L, %L)', (select id from s), 'EMP40', '99999999-9999-4999-8999-999999999999'), 'rehire_approver_not_admin');
select pg_temp.expect_code('rehire: self approval',
  format('select pg_temp.rehire(%L, %L, %L)', (select admin_a from people), 'EMP40', (select admin_a from people)), 'rehire_self_approval');
select pg_temp.expect_code('rehire: reason empty',
  format('select pg_temp.rehire(%L, %L, %L, %L)', (select id from s), 'EMP40', (select admin_a from people), '  '), 'rehire_reason_required');
select pg_temp.expect_code('rehire: reason null',
  format('select pg_temp.rehire(%L, %L, %L, null)', (select id from s), 'EMP40', (select admin_a from people)), 'rehire_reason_required');
select pg_temp.expect_code('rehire: wrong stated company',
  format('select pg_temp.rehire(%L, %L, %L, p_company => %L)', (select id from s), 'EMP40', (select admin_a from people), '1ba00000-0000-4000-8000-0000000000aa'), 'rehire_company_scope');
select pg_temp.expect_code('rehire: not linked (name only)',
  format('select pg_temp.rehire(%L, %L, %L)', (select manager from people), 'EMP40', (select admin_a from people)), 'rehire_not_linked');

create temp table rh_other as select pg_temp.mk(60, p_method => 'unmatched_backfill', p_status => 'active') as id,
                                     pg_temp.mk(61, p_status => 'active') as never_revoked;
select pg_temp.expect_code('rehire: link method not confirmed',
  format('select pg_temp.rehire(%L, %L, %L)', (select id from rh_other), 'EMP60', (select admin_a from people)), 'rehire_link_not_confirmed');
select pg_temp.expect_code('rehire: account was never revoked by enforcement',
  format('select pg_temp.rehire(%L, %L, %L)', (select never_revoked from rh_other), 'EMP61', (select admin_a from people)), 'rehire_not_revoked_by_enforcement');

-- Woven unknown / missing / conflict
update public.employee_access_directory set employment_status = 'unknown' where external_employee_id = 'EMP40';
select pg_temp.expect_code('rehire: unknown in Woven',
  format('select pg_temp.rehire(%L, %L, %L)', (select id from s), 'EMP40', (select admin_a from people)), 'rehire_not_active_in_latest_read');
update public.employee_access_directory set employment_status = 'active', missing_sync_count = 1 where external_employee_id = 'EMP40';
select pg_temp.expect_code('rehire: missing from the latest read',
  format('select pg_temp.rehire(%L, %L, %L)', (select id from s), 'EMP40', (select admin_a from people)), 'rehire_not_active_in_latest_read');
update public.employee_access_directory set missing_sync_count = 0, data_issues = array['status_termination_conflict'] where external_employee_id = 'EMP40';
select pg_temp.expect_code('rehire: Active only with a past TerminationDate',
  format('select pg_temp.rehire(%L, %L, %L)', (select id from s), 'EMP40', (select admin_a from people)), 'rehire_status_conflict');
update public.employee_access_directory set data_issues = '{}' where external_employee_id = 'EMP40';

-- latest sync failed / another company
insert into public.employee_sync_runs (requested_by, status, started_at, finished_at, error_code)
values ('check', 'failed', now() - interval '2 minutes', now() - interval '1 minute', 'woven_unreachable');
select pg_temp.expect_code('rehire: latest sync failed',
  format('select pg_temp.rehire(%L, %L, %L)', (select id from s), 'EMP40', (select admin_a from people)), 'rehire_directory_not_current');
insert into public.employee_sync_runs (requested_by, status, started_at, finished_at, woven_company_id)
values ('check', 'succeeded', now() - interval '90 seconds', now() - interval '80 seconds', '1ba00000-0000-4000-8000-0000000000aa');
select pg_temp.expect_code('rehire: latest run of another company',
  format('select pg_temp.rehire(%L, %L, %L)', (select id from s), 'EMP40', (select admin_a from people)), 'rehire_directory_not_current');
-- a directory row of another company
update public.employee_access_directory set woven_company_id = '1ba00000-0000-4000-8000-0000000000aa' where external_employee_id = 'EMP40';
select pg_temp.expect_code('rehire: directory row of another company',
  format('select pg_temp.rehire(%L, %L, %L)', (select id from s), 'EMP40', (select admin_a from people)), 'rehire_company_scope');
update public.employee_access_directory set woven_company_id = '55839f24-9241-418c-8405-37baf9a42a87' where external_employee_id = 'EMP40';
do $$
begin
  perform pg_temp.assert('rehire refusals changed nothing',
    (select status::text from public.app_users where id = (select id from s)) = 'disabled'
    and (select reactivated_at is null and access_revoked_at is not null from public.employee_account_links where app_user_id = (select id from s))
    and not exists (select 1 from public.app_user_audit where action = 'woven_rehire_approved'));
end;
$$;

-- a current, pinned sync again
insert into public.employee_sync_runs (requested_by, status, started_at, finished_at)
values ('check', 'succeeded', now() - interval '30 seconds', now() - interval '20 seconds');

-- record_rehire refuses when nothing is pending, and for a non-admin
select pg_temp.expect_code('record_rehire: nothing pending',
  format('select public.employee_access_record_rehire(%L, %L, true, ''x'')', (select id from s), (select admin_a from people)), 'record_rehire_not_pending');

-- success, in two phases
do $$
declare
  v_id uuid := (select id from s);
  v_a  uuid := (select admin_a from people);
begin
  perform pg_temp.assert('phase one enables the profile', pg_temp.rehire(v_id, 'EMP40', v_a, 'rehired 2 Nov, HR confirmed') = 'rehire_enabled');
  perform pg_temp.assert('profile active', (select status::text from public.app_users where id = v_id) = 'active');
  perform pg_temp.assert('revocation record kept until the ban is lifted',
    (select access_revoked_at is not null and reactivated_at is not null from public.employee_account_links where app_user_id = v_id));
  perform pg_temp.assert('audit names the approving administrator and the reason',
    (select count(*) from public.app_user_audit
      where target_user_id = v_id and action = 'woven_rehire_approved' and actor_user_id = v_a
        and actor_email = 'u900@example.test' and to_value like '%rehired 2 Nov, HR confirmed%') = 1);
  perform pg_temp.assert('status audit by the administrator',
    (select count(*) from public.app_user_audit where target_user_id = v_id and action = 'status_changed' and from_value = 'disabled' and to_value = 'active' and actor_user_id = v_a) = 1);

  -- a crash between the phases: the retry resumes, with no second approval row
  perform pg_temp.assert('resume', pg_temp.rehire(v_id, 'EMP40', v_a) = 'rehire_pending_completion');
  perform pg_temp.assert('no second approval row', (select count(*) from public.app_user_audit where target_user_id = v_id and action = 'woven_rehire_approved') = 1);

  -- phase two: the ban is lifted
  perform pg_temp.assert('record ok', public.employee_access_record_rehire(v_id, v_a, true, 'auth_ban_lifted') = 'recorded');
  perform pg_temp.assert('revocation record cleared', (select access_revoked_at is null from public.employee_account_links where app_user_id = v_id));
  perform pg_temp.assert('access_restored audit by the administrator',
    (select count(*) from public.app_user_audit where target_user_id = v_id and action = 'access_restored' and actor_user_id = v_a) = 1);

  -- idempotent
  perform pg_temp.assert('repeat approval is a no-op', pg_temp.rehire(v_id, 'EMP40', v_a) = 'already_rehired');
  perform pg_temp.assert('repeat record is a no-op', public.employee_access_record_rehire(v_id, v_a, true, 'x') = 'already_recorded');
  perform pg_temp.assert('no extra audit rows',
    (select count(*) from public.app_user_audit where target_user_id = v_id and action in ('woven_rehire_approved', 'access_restored')) = 2);
end;
$$;
select pg_temp.expect_code('record_rehire: non-admin',
  format('select public.employee_access_record_rehire(%L, %L, true, ''x'')', (select id from s), (select manager from people)), 'rehire_approver_not_admin');

-- a failed ban lift: the profile goes BACK to disabled (incomplete, retryable), then the retry completes
do $$
declare
  v_id uuid := (select other from s);
  v_a  uuid := (select admin_a from people);
begin
  perform pg_temp.assert('B: enabled', pg_temp.rehire(v_id, 'EMP41', v_a) = 'rehire_enabled');
  perform pg_temp.assert('B: reverted', public.employee_access_record_rehire(v_id, v_a, false, 'unban') = 'reverted');
  perform pg_temp.assert('B: profile disabled again, revocation record intact',
    (select status::text from public.app_users where id = v_id) = 'disabled'
    and (select reactivated_at is null and access_revoked_at is not null from public.employee_account_links where app_user_id = v_id));
  perform pg_temp.assert('B: incomplete audited by the administrator',
    (select count(*) from public.app_user_audit where target_user_id = v_id and action = 'access_revocation_incomplete' and to_value like 'failed:unban%' and actor_user_id = v_a) = 1);
  perform pg_temp.assert('B: retry enables again', pg_temp.rehire(v_id, 'EMP41', v_a) = 'rehire_enabled');
  perform pg_temp.assert('B: retry completes', public.employee_access_record_rehire(v_id, v_a, true, 'auth_ban_lifted') = 'recorded');
  perform pg_temp.assert('B: active, revocation cleared',
    (select status::text from public.app_users where id = v_id) = 'active'
    and (select access_revoked_at is null from public.employee_account_links where app_user_id = v_id));
end;
$$;

-- a re-terminated employee starts a NEW revocation (needs a new review of a newer run)
update public.employee_access_directory set employment_status = 'terminated' where external_employee_id = 'EMP40';
create temp table r3 as select pg_temp.mk_shadow(interval '1 minute', 'completed', '{}', array['EMP40']) as id;
create temp table rev3 as select pg_temp.review((select id from r3), (select admin_a from people), array['EMP40']) as id;
do $$
declare v_id uuid := (select id from s);
begin
  perform pg_temp.assert('terminated again: disabled', pg_temp.disable(v_id, 'EMP40', p_review => (select id from rev3)) = 'disabled');
  perform pg_temp.assert('a new revocation record',
    (select terminated_at is not null and reactivated_at is null from public.employee_account_links where app_user_id = v_id));
end;
$$;

-- ============================================================= 6. the run record
do $$
declare
  v_actions jsonb := '[{"external_employee_id":"EMP40","action":"DISABLE_TERMINATED","is_primary":true,"reason_codes":[],"result":"failed","result_code":"auth_revocation_incomplete.sessions"}]';
  v_run uuid;
begin
  perform pg_temp.expect_code('a run with a failed account is not completed',
    format('select public.employee_access_record_apply_run(''cron'', null, ''access-policy-1'', ''completed'', ''{}'', ''{}'', %L)', v_actions), 'employee_access_record_apply_run: a run with a failed account is not completed');
  perform pg_temp.expect_code('unknown status',
    format('select public.employee_access_record_apply_run(''cron'', null, ''access-policy-1'', ''succeeded'', ''{}'', ''{}'', %L)', v_actions), 'employee_access_record_apply_run: unknown status');
  perform pg_temp.expect_code('only DISABLE_TERMINATED outcomes',
    'select public.employee_access_record_apply_run(''cron'', null, ''access-policy-1'', ''completed'', ''{}'', ''{}'', ''[{"action":"UPDATE_ROLE","result":"applied"}]'')',
    'employee_access_record_apply_run: only DISABLE_TERMINATED outcomes are recorded');
  v_run := public.employee_access_record_apply_run('cron', null, 'access-policy-1', 'partial', '{}', '{}', v_actions);
  perform pg_temp.assert('partial run recorded as partial',
    (select status = 'partial' and mode = 'apply' from public.employee_access_runs where id = v_run));
  perform pg_temp.assert('per-account outcome recorded',
    (select count(*) from public.employee_access_actions where access_run_id = v_run and result = 'failed' and result_code = 'auth_revocation_incomplete.sessions') = 1);
  v_run := public.employee_access_record_apply_run('cron', null, 'access-policy-1', 'aborted', array['directory_sync_stale'], '{}', '[]');
  perform pg_temp.assert('aborted run names its guard', (select guard_codes = array['directory_sync_stale'] from public.employee_access_runs where id = v_run));
end;
$$;

-- ============================================================== 7. privileges
do $$
declare
  v_fn text;
  v_role text;
begin
  foreach v_fn in array array[
    'public.employee_access_review_state()',
    'public.employee_access_record_shadow_review(uuid, uuid, text[], text, uuid, text)',
    'public.employee_access_disable_terminated(uuid, text, uuid, uuid, uuid[], text)',
    'public.employee_access_record_revocation(uuid, boolean, text, text)',
    'public.employee_access_approve_rehire(uuid, text, uuid, uuid, text)',
    'public.employee_access_record_rehire(uuid, uuid, boolean, text)',
    'public.employee_access_record_apply_run(text, uuid, text, text, text[], jsonb, jsonb)'
  ] loop
    foreach v_role in array array['anon', 'authenticated', 'public'] loop
      if v_role = 'public' then
        if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    where p.oid = v_fn::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
          raise exception 'ENFORCEMENT CHECK FAILED (privileges): PUBLIC can execute %', v_fn;
        end if;
      elsif has_function_privilege(v_role, v_fn, 'execute') then
        raise exception 'ENFORCEMENT CHECK FAILED (privileges): % can execute %', v_role, v_fn;
      end if;
    end loop;
    if not has_function_privilege('service_role', v_fn, 'execute') then
      raise exception 'ENFORCEMENT CHECK FAILED (privileges): service_role cannot execute %', v_fn;
    end if;
  end loop;

  foreach v_fn in array array[
    'public.employee_access_directory_is_current()',
    'public.employee_access_observed_status(text)',
    'public.employee_access_is_protected(uuid, uuid[])',
    'public.employee_access_is_active_admin(uuid)',
    'public.employee_access_ids_hash(text[])'
  ] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(v_role, v_fn, 'execute') then
        raise exception 'ENFORCEMENT CHECK FAILED (privileges): % can execute helper %', v_role, v_fn;
      end if;
    end loop;
  end loop;

  -- the review table: service_role may SELECT and INSERT only, browser roles nothing
  if has_table_privilege('service_role', 'public.employee_access_shadow_reviews', 'update')
     or has_table_privilege('service_role', 'public.employee_access_shadow_reviews', 'delete')
     or has_table_privilege('anon', 'public.employee_access_shadow_reviews', 'select')
     or has_table_privilege('authenticated', 'public.employee_access_shadow_reviews', 'select')
     or not has_table_privilege('service_role', 'public.employee_access_shadow_reviews', 'insert') then
    raise exception 'ENFORCEMENT CHECK FAILED (privileges): employee_access_shadow_reviews grants';
  end if;
end;
$$;

-- reviews are append-only
select pg_temp.expect_code('review rows cannot be changed',
  format('update public.employee_access_shadow_reviews set reason = ''x'' where id = %L', (select id from rev)), 'employee_access_actions is append-only');

-- a browser role really is refused when it calls the function
set local role authenticated;
select pg_temp.expect_code('authenticated call',
  $q$select public.employee_access_approve_rehire('00000000-0000-4000-8000-000000000001', 'EMP1', '55839f24-9241-418c-8405-37baf9a42a87', '00000000-0000-4000-8000-000000000001', 'x')$q$,
  'permission denied for function employee_access_approve_rehire');
reset role;

rollback;
