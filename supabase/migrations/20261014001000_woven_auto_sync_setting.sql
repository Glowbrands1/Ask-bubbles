-- ============================================================================
-- WOVEN EMPLOYEE SYNC — THE AUTO SYNC ON/OFF SETTING, kept in the database
-- ============================================================================
--
-- Additive only: two new tables and one function. No existing table, row,
-- policy, grant or function is touched. Rollback:
-- supabase/rollbacks/20261014001000_woven_auto_sync_setting_down.sql.
--
-- WHY: the scheduled sync was switched by an environment variable, which only
-- someone with Vercel access could change. An administrator now turns it on and
-- off inside Ask Bubbles, and the cron route reads THIS setting.
--
--   employee_sync_settings       ONE row (enforced). `auto_sync_enabled` defaults
--                                to FALSE, so applying this migration schedules
--                                nothing. Pinned to Midwest Soap Makers by CHECK.
--   employee_sync_setting_audit  append-only: who switched it, when, from what.
--   employee_sync_set_auto()     the only writer. It REFUSES to turn automatic
--                                sync ON until a saved directory exists (at least
--                                one succeeded stored run AND at least one
--                                employee on file), so a schedule can never be
--                                the very first thing to write the directory.
--
-- THE SETTING IS ONE LOCK OF SEVERAL, never the only one. The cron route still
-- needs CRON_SECRET, WOVEN_SYNC_ENABLED, WOVEN_SYNC_WRITES_ENABLED and the run
-- lock; the sync still proves every record is Midwest Soap Makers, refuses an
-- incomplete read, and never touches accounts, invitations or logins.
--
-- PRIVILEGES: row level security enabled and forced, nothing granted to `anon`
-- or `authenticated`; the application reads and writes through the service role.

create table if not exists public.employee_sync_settings (
  singleton boolean primary key default true check (singleton),
  auto_sync_enabled boolean not null default false,
  woven_company_id uuid not null default '55839f24-9241-418c-8405-37baf9a42a87'
    check (woven_company_id = '55839f24-9241-418c-8405-37baf9a42a87'),
  updated_at timestamptz not null default now(),
  updated_by text check (updated_by is null or (length(btrim(updated_by)) > 0 and length(updated_by) <= 200))
);

insert into public.employee_sync_settings (singleton) values (true) on conflict (singleton) do nothing;

create table if not exists public.employee_sync_setting_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null check (length(btrim(actor)) > 0 and length(actor) <= 200),
  from_enabled boolean not null,
  to_enabled boolean not null
);

create or replace function public.employee_sync_setting_audit_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'employee_sync_setting_audit is append-only' using errcode = 'check_violation';
end;
$$;

drop trigger if exists employee_sync_setting_audit_no_change on public.employee_sync_setting_audit;
create trigger employee_sync_setting_audit_no_change
  before update or delete on public.employee_sync_setting_audit
  for each row execute function public.employee_sync_setting_audit_guard();

/*
 * The only writer. Returns {enabled, changed}. Turning ON raises
 * `auto_sync_requires_saved_directory` (check_violation) unless a stored run
 * succeeded and the directory holds at least one employee. Turning OFF always works.
 */
create or replace function public.employee_sync_set_auto(p_enabled boolean, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before boolean;
begin
  if p_enabled is null then
    raise exception 'employee_sync_set_auto: enabled must be true or false' using errcode = 'check_violation';
  end if;
  if p_actor is null or length(btrim(p_actor)) = 0 then
    raise exception 'employee_sync_set_auto: actor is required' using errcode = 'check_violation';
  end if;

  select auto_sync_enabled into v_before from public.employee_sync_settings where singleton for update;
  if not found then
    insert into public.employee_sync_settings (singleton) values (true);
    v_before := false;
  end if;

  if p_enabled and not v_before then
    if not exists (select 1 from public.employee_sync_runs where status = 'succeeded')
       or not exists (select 1 from public.employee_access_directory) then
      raise exception 'auto_sync_requires_saved_directory' using errcode = 'check_violation';
    end if;
  end if;

  if p_enabled is distinct from v_before then
    update public.employee_sync_settings
       set auto_sync_enabled = p_enabled, updated_at = now(), updated_by = left(p_actor, 200)
     where singleton;
    insert into public.employee_sync_setting_audit (actor, from_enabled, to_enabled)
    values (left(p_actor, 200), v_before, p_enabled);
  end if;

  return jsonb_build_object('enabled', p_enabled, 'changed', p_enabled is distinct from v_before);
end;
$$;

alter table public.employee_sync_settings enable row level security;
alter table public.employee_sync_settings force row level security;
alter table public.employee_sync_setting_audit enable row level security;
alter table public.employee_sync_setting_audit force row level security;

revoke all on table public.employee_sync_settings from anon, authenticated;
revoke all on table public.employee_sync_setting_audit from anon, authenticated;
revoke all on sequence public.employee_sync_setting_audit_id_seq from anon, authenticated;
revoke all on function public.employee_sync_set_auto(boolean, text) from public, anon, authenticated;
revoke all on function public.employee_sync_setting_audit_guard() from public, anon, authenticated;

grant select on table public.employee_sync_settings to service_role;
grant select on table public.employee_sync_setting_audit to service_role;
grant execute on function public.employee_sync_set_auto(boolean, text) to service_role;

comment on table public.employee_sync_settings is
  'The single Auto Sync on/off setting for the Woven employee directory (Midwest Soap Makers). Defaults to off; changed only through employee_sync_set_auto.';
comment on table public.employee_sync_setting_audit is
  'Append-only record of who switched automatic Woven sync on or off.';
