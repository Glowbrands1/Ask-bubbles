-- ============================================================================
-- THE LINKS GUARD'S LIFECYCLE SETTING DOES NOT LEAK ACROSS TRANSACTIONS
-- ============================================================================
--
-- run by scripts/db/verify-migrations.sh, against the throwaway cluster only.
-- Unlike the other check files this one COMMITS (it must: the property is about
-- what happens after a commit), so it creates its own fixture rows in committed
-- transactions and removes them at the end. Each top-level statement below is its
-- own transaction (psql autocommit) unless wrapped in begin / commit.
--
-- Proves: the setting app.woven_link_lifecycle is transaction-local. A lifecycle
-- stamp passes inside the transaction that sets it 'on' and is refused again in
-- the NEXT transaction, on the same connection, without anything turning it off.

\set ON_ERROR_STOP 1

insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-4000-8000-0000000000c1', 'leak-check@example.test', now());
insert into public.app_users (id, email, display_name, role, status, scope_level, scope_primary_area_id)
values ('00000000-0000-4000-8000-0000000000c1', 'leak-check@example.test', 'Leak Check', 'location_manager', 'active', 'location', 'loc-0307');
insert into public.employee_account_links (app_user_id, management, external_employee_id, link_method, managed_status, set_by)
values ('00000000-0000-4000-8000-0000000000c1', 'woven_linked', 'LEAK-CHECK-1', 'admin_confirmed_email', true, 'admin:reviewer@example.test');

create function pg_temp.try_stamp(p_offset interval) returns text
language plpgsql as $$
begin
  update public.employee_account_links set last_synced_at = now() + p_offset where app_user_id = '00000000-0000-4000-8000-0000000000c1';
  return 'updated';
exception when check_violation then
  return sqlerrm;
end;
$$;

create function pg_temp.expect(p_label text, p_got text, p_want text) returns void
language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'LEAK CHECK FAILED (%): expected "%", got "%"', p_label, p_want, p_got;
  end if;
end;
$$;

-- 1. strict by default, in a fresh transaction
select pg_temp.expect('a stamp is refused with the setting unset', pg_temp.try_stamp('1 hour'),
  'employee_account_links: only managed_status, managed_location and managed_role can change');

-- 2. inside ONE transaction that sets it on, the stamp passes; it is committed
begin;
select set_config('app.woven_link_lifecycle', 'on', true);
select pg_temp.expect('a stamp passes while the setting is on', pg_temp.try_stamp('2 hours'), 'updated');
commit;

-- 3. the NEXT transaction (same connection): the setting is gone, the stamp is refused again
select pg_temp.expect('the setting did not leak past the commit', pg_temp.try_stamp('3 hours'),
  'employee_account_links: only managed_status, managed_location and managed_role can change');
select pg_temp.expect('the setting is not on in a new transaction', (coalesce(current_setting('app.woven_link_lifecycle', true), '') <> 'on')::text, 'true');

-- 4. a setting made in its own (auto-committed) statement does not reach the next statement
select set_config('app.woven_link_lifecycle', 'on', true);
select pg_temp.expect('a setting in an earlier statement does not unlock a later one', pg_temp.try_stamp('4 hours'),
  'employee_account_links: only managed_status, managed_location and managed_role can change');

-- 5. a rolled-back transaction leaves nothing behind either
begin;
select set_config('app.woven_link_lifecycle', 'on', true);
rollback;
select pg_temp.expect('a rolled-back setting does not leak', pg_temp.try_stamp('5 hours'),
  'employee_account_links: only managed_status, managed_location and managed_role can change');

-- cleanup of the committed fixture
delete from public.employee_account_links where app_user_id = '00000000-0000-4000-8000-0000000000c1';
delete from public.app_users where id = '00000000-0000-4000-8000-0000000000c1';
delete from auth.users where id = '00000000-0000-4000-8000-0000000000c1';
