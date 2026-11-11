-- ============================================================================
-- PRODUCTION-PARITY STATE — NOT A MIGRATION. NEVER APPLY TO A REAL PROJECT.
-- ============================================================================
--
-- Reproduces, on a disposable database already migrated up to 20261016001000, the
-- ways the live Ask Bubbles database differs from "the repository's migrations
-- applied in order". Found by a read-only, object-by-object comparison on 2026-10-19
-- (docs/migration-reconciliation-2026-10-19.md). Used only by
-- scripts/db/verify-production-parity.sh.
--
--   A. The four objects applied by hand from Ask Sunny's
--      20261006001000_woven_adoption_and_credentials.sql (statements below are that
--      file's, verbatim): audit vocabulary of 12, the links guard function + trigger,
--      the column-level UPDATE grant, auth_clear_user_credentials.
--   B. The 4-argument google_review_apply_reviews overload from 20261013001000, which
--      20261014001000 drops but production still has (the harness adds it back from
--      the 20261013001000 file; it is not repeated here).
--   C. The earlier google_reviews_monthly body, which joins the two base tables
--      instead of reading google_reviews_feed (same results; the repository's
--      20261014001000 version reads the view).

-- ---------------------------------------------------------------- A ---

alter table public.app_user_audit
  drop constraint if exists app_user_audit_action_check;

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

create or replace function public.employee_account_links_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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
$$;

revoke all on function public.employee_account_links_guard_update() from public, anon, authenticated, service_role;

drop trigger if exists employee_account_links_guard_update on public.employee_account_links;
create trigger employee_account_links_guard_update
  before update on public.employee_account_links
  for each row execute function public.employee_account_links_guard_update();

grant update (managed_status, managed_location, managed_role) on public.employee_account_links to service_role;

create or replace function public.auth_clear_user_credentials(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.auth_clear_user_credentials(uuid) from public, anon, authenticated;
grant execute on function public.auth_clear_user_credentials(uuid) to service_role;

-- ---------------------------------------------------------------- C ---

create or replace function public.google_reviews_monthly(p_store_code text)
returns table(month date, review_count bigint, average_rating numeric)
language sql
stable security definer
set search_path = ''
as $$
  select date_trunc('month', f.review_create_time at time zone 'America/Chicago')::date,
         count(*), round(avg(f.star_rating)::numeric, 2)
    from public.google_reviews f
    join public.google_review_locations l on l.id = f.location_id
   where f.removed_at is null and (p_store_code is null or l.store_code = p_store_code)
   group by 1 order by 1;
$$;
