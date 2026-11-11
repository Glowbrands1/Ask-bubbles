-- =============================================================================
-- Capture the Ask Sunny-derived objects that already exist on the Ask Bubbles database
-- =============================================================================
--
-- The live Ask Bubbles database carries four things that no earlier migration here
-- creates. They match Ask Sunny's 20261006001000_woven_adoption_and_credentials.sql,
-- which was applied to it by hand and never recorded in its migration history:
--
--   1. app_user_audit_action_check allows two more actions, 'managed_flags_changed'
--      and 'credentials_reset' (12 in all; this repository's earlier migration lists 10).
--   2. trigger + function employee_account_links_guard_update(): only managed_status,
--      managed_location, managed_role and updated_at may change on a link.
--   3. service_role may UPDATE exactly those three columns of employee_account_links
--      (column-level grant).
--   4. function auth_clear_user_credentials(uuid): blanks a password and ends all
--      sessions; service_role only.
--
-- THIS MIGRATION PRESERVES PRODUCTION AS IT IS. It makes no guard weaker and no
-- permission wider:
--   * On a database that already has these objects (production) every step is a
--     no-op: nothing is dropped, replaced, re-created or re-granted differently.
--   * On a database built only from this repository it creates them, in the same
--     form production has, so that a fresh environment behaves like production.
--
-- It is written to be safe to apply more than once, and every step is conditional on
-- the object being absent. Verified by scripts/db/verify-production-parity.sh against
-- a database reproducing the live state, and by supabase/tests/capture_live_objects_checks.sql.
--
-- ORDER: this must run BEFORE 20261019001000_woven_disable_terminated_apply.sql, which
-- builds on the guard captured here.
--
-- KEEP THE AUDIT LIST AT 12 OR MORE. A later migration that rewrites
-- app_user_audit_action_check must carry 'managed_flags_changed' and 'credentials_reset',
-- or it narrows what production allows.

-- ------------------------------------------------------ 1. audit vocabulary ---

do $capture$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.app_user_audit'::regclass
       and conname = 'app_user_audit_action_check'
       and pg_get_constraintdef(oid) like '%managed_flags_changed%'
       and pg_get_constraintdef(oid) like '%credentials_reset%'
  ) then
    alter table public.app_user_audit drop constraint if exists app_user_audit_action_check;
    alter table public.app_user_audit
      add constraint app_user_audit_action_check
      check (action in (
        'invited',
        'invite_resent',
        'invitation_accepted',
        'reset_requested',
        'role_changed',
        'status_changed',
        'scope_changed',
        'access_revoked',
        'access_restored',
        'access_revocation_incomplete',
        'managed_flags_changed',
        'credentials_reset'
      ));
  end if;
end
$capture$;

-- ------------------------------------------- 2. the links guard (strict) ---

do $capture$
begin
  if to_regprocedure('public.employee_account_links_guard_update()') is null then
    create function public.employee_account_links_guard_update()
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
  end if;
end
$capture$;

/* A trigger function is never called directly; nobody holds EXECUTE (as on production). */
revoke all on function public.employee_account_links_guard_update() from public, anon, authenticated, service_role;

do $capture$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.employee_account_links'::regclass
       and tgname = 'employee_account_links_guard_update'
       and not tgisinternal
  ) then
    create trigger employee_account_links_guard_update
      before update on public.employee_account_links
      for each row execute function public.employee_account_links_guard_update();
  end if;
end
$capture$;

-- --------------------------- 3. the column-level grant (exactly as on production) ---

grant update (managed_status, managed_location, managed_role) on public.employee_account_links to service_role;

-- ------------------------------------ 4. clear a password, end the sessions ---

do $capture$
begin
  if to_regprocedure('public.auth_clear_user_credentials(uuid)') is null then
    create function public.auth_clear_user_credentials(p_user_id uuid)
    returns jsonb
    language plpgsql
    security definer
    set search_path = ''
    as $fn$
    declare
      v_found    integer := 0;
      v_tokens   integer := 0;
      v_sessions integer := 0;
    begin
      if p_user_id is null then
        raise exception 'auth_clear_user_credentials: a user id is required'
          using errcode = 'invalid_parameter_value';
      end if;

      /* '' is what an invited account that has not chosen a password holds: no password matches it. */
      update auth.users
         set encrypted_password = '', updated_at = now()
       where id = p_user_id and deleted_at is null;
      get diagnostics v_found = row_count;
      if v_found = 0 then
        raise exception 'auth_clear_user_credentials: no such user'
          using errcode = 'no_data_found';
      end if;

      delete from auth.refresh_tokens where user_id = p_user_id::text;
      get diagnostics v_tokens = row_count;

      delete from auth.sessions where user_id = p_user_id;
      get diagnostics v_sessions = row_count;

      return jsonb_build_object('refresh_tokens', v_tokens, 'sessions', v_sessions);
    end;
    $fn$;
  end if;
end
$capture$;

revoke all on function public.auth_clear_user_credentials(uuid) from public, anon, authenticated;
grant execute on function public.auth_clear_user_credentials(uuid) to service_role;
