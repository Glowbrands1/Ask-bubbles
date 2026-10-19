-- ============================================================================
-- PRODUCTION-PARITY FIXTURE — NOT A MIGRATION. NEVER APPLY TO A REAL PROJECT.
-- ============================================================================
--
-- The LIVE Ask Bubbles database carries two objects that NO repository
-- migration creates (they were applied by hand and are not in its migration
-- history), found by a read-only comparison of the live schema with a database
-- built from the repo's migrations:
--
--   trigger  employee_account_links_guard_update  BEFORE UPDATE ON
--            public.employee_account_links FOR EACH ROW
--   function public.employee_account_links_guard_update()  (plpgsql, NOT
--            security definer, search_path '')
--
-- It lets only the three managed_* flags and updated_at change. Triggers fire
-- inside SECURITY DEFINER functions too, so against that database the
-- termination enforcement and rehire functions (which stamp terminated_at,
-- reactivated_at, access_revoked_at, revoked_woven_status, last_synced_at) are
-- refused with check_violation — while a database built only from the repo has
-- no such trigger and every test passes.
--
-- THIS FILE REPRODUCES EXACTLY THE LIVE FUNCTION AND TRIGGER so the throwaway
-- cluster (scripts/db/verify-migrations.sh) and the local stack
-- (scripts/local-stack/up.sh) test against what production really has. Both
-- apply it right after 20261002002000_woven_account_links.sql, i.e. BEFORE the
-- migration under test, exactly as in production. Set VERIFY_PARITY=0 to build
-- WITHOUT it and prove the end state is the same either way.
--
-- A third live-only object, public.auth_clear_user_credentials(uuid)
-- (security definer, service_role-only), is deliberately NOT reproduced: no
-- repo code uses it and nothing here may depend on it.

create or replace function public.employee_account_links_guard_update()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if (to_jsonb(new) - array['managed_status','managed_location','managed_role','updated_at']) is distinct from (to_jsonb(old) - array['managed_status','managed_location','managed_role','updated_at']) then
    raise exception 'employee_account_links: only managed_status, managed_location and managed_role can change' using errcode='check_violation';
  end if;
  return new;
end;
$$;

-- Privileges as observed (read-only) on the live database: the function is owned by
-- postgres and is NOT executable by public, anon, authenticated or service_role.
-- Without this, a fresh CREATE FUNCTION would leave default PUBLIC execute and the
-- fixture would not match production.
revoke all on function public.employee_account_links_guard_update() from public, anon, authenticated, service_role;

drop trigger if exists employee_account_links_guard_update on public.employee_account_links;
create trigger employee_account_links_guard_update
  before update on public.employee_account_links
  for each row execute function public.employee_account_links_guard_update();
