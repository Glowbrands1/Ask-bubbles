-- ============================================================================
-- ROLLBACK of 20261019001000_woven_disable_terminated_apply.sql
-- ============================================================================
-- NOT run by anything automatically. For the technical team, after the owner's say-so.
--   psql "$DB_URL" -1 -v ON_ERROR_STOP=1 -f supabase/rollbacks/20261019001000_woven_disable_terminated_down.sql
-- then delete its row: delete from supabase_migrations.schema_migrations where version = '20261019001000';
--
-- Puts the database back to the state 20261017001000 leaves it in (checked: object for object identical).
-- It REFUSES (and changes nothing) if enforcement ever acted: an apply run, a review, a reviewer
-- designation, a rehire approval, or a link carrying a termination / revocation / reactivation stamp.
-- That history would be destroyed or orphaned; in that case rolling back is a decision for the
-- owner, not a script. Turn the switch off instead (WOVEN_TERMINATION_ENFORCEMENT unset).
--
-- The guard function goes back to its strict form (only the three managed flags and updated_at change).

do $guard$
begin
  if exists (select 1 from public.employee_access_runs where mode = 'apply')
     or exists (select 1 from public.employee_access_shadow_reviews)
     or exists (select 1 from public.woven_enforcement_reviewers)
     or exists (select 1 from public.app_user_audit where action in ('woven_rehire_approved', 'woven_reviewer_designated', 'woven_reviewer_revoked'))
     or exists (select 1 from public.employee_account_links where terminated_at is not null or reactivated_at is not null or access_revoked_at is not null)
  then
    raise exception 'rollback refused: enforcement has acted (apply runs, reviews, designations, rehires or link stamps exist)';
  end if;
end
$guard$;

-- the lifecycle functions and predicates
drop function if exists public.employee_access_record_apply_run(text, uuid, text, text, text[], jsonb, jsonb);
drop function if exists public.employee_access_revoke_reviewer(uuid, uuid, text);
drop function if exists public.employee_access_designate_reviewer(uuid, uuid, text);
drop function if exists public.employee_access_record_rehire(uuid, uuid, boolean, text);
drop function if exists public.employee_access_approve_rehire(uuid, text, uuid, uuid, text);
drop function if exists public.employee_access_record_revocation(uuid, boolean, text, text);
drop function if exists public.employee_access_disable_terminated(uuid, text, uuid, uuid, uuid[], text);
drop function if exists public.employee_access_record_shadow_review(uuid, uuid, text[], text, uuid, text);
drop function if exists public.employee_access_review_state();
drop function if exists public.employee_access_ids_hash(text[]);
drop function if exists public.employee_access_is_designated_reviewer(uuid);
drop function if exists public.employee_access_is_active_admin(uuid);
drop function if exists public.employee_access_is_protected(uuid, uuid[]);
drop function if exists public.employee_access_observed_status(text);
drop function if exists public.employee_access_directory_is_current();

-- the two append-only tables (empty: checked above)
drop table if exists public.employee_access_shadow_reviews;
drop table if exists public.woven_enforcement_reviewers;
drop function if exists public.woven_enforcement_reviewers_guard();

-- the run record, back to shadow-only
alter table public.employee_access_actions drop constraint if exists employee_access_actions_result_check;
alter table public.employee_access_actions add constraint employee_access_actions_result_check check (result in ('shadow'));
alter table public.employee_access_actions drop constraint if exists employee_access_actions_result_code_check;
alter table public.employee_access_actions drop column if exists result_code;
alter table public.employee_access_runs drop constraint if exists employee_access_runs_status_check;
alter table public.employee_access_runs add constraint employee_access_runs_status_check check (status in ('completed', 'aborted'));
alter table public.employee_access_runs drop constraint if exists employee_access_runs_mode_check;
alter table public.employee_access_runs add constraint employee_access_runs_mode_check check (mode in ('shadow'));

-- the audit list, back to the twelve actions production had before (never fewer)
alter table public.app_user_audit drop constraint if exists app_user_audit_action_check;
alter table public.app_user_audit add constraint app_user_audit_action_check
  check (action in (
    'invited', 'invite_resent', 'invitation_accepted', 'reset_requested', 'role_changed', 'status_changed',
    'scope_changed', 'access_revoked', 'access_restored', 'access_revocation_incomplete',
    'managed_flags_changed', 'credentials_reset'
  ));

-- the links guard, strict again (same body 20261017001000 captured; privileges unchanged: nobody holds EXECUTE)
create or replace function public.employee_account_links_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  /* Everything except the three flags (and the touched timestamp) is the link's identity. */
  if (to_jsonb(new) - array['managed_status', 'managed_location', 'managed_role', 'updated_at'])
     is distinct from
     (to_jsonb(old) - array['managed_status', 'managed_location', 'managed_role', 'updated_at']) then
    raise exception 'employee_account_links: only managed_status, managed_location and managed_role can change'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;
revoke all on function public.employee_account_links_guard_update() from public, anon, authenticated, service_role;
