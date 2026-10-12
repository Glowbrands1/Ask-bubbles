-- ---------------------------------------------------------------------------
-- WOVEN EMPLOYEE DIRECTORY — COMPANY SCOPE: Midwest Soap Makers, in the data
--
-- Ask Bubbles reads exactly one Woven company: Buff City Soap's Midwest Soap
-- Makers, CompanyID 55839F24-9241-418C-8405-37BAF9A42A87, pinned in code
-- (`WOVEN_TENANT`, src/config/company/woven.ts). The application already
-- refuses a token issued for any other company and, per record, any employee,
-- employee-details, details-location or catalog-location record that names
-- another company or none (`src/lib/employees/woven/company-scope.ts`). This
-- migration makes the database hold the same line, so no code path — present
-- or future — can save a Woven row for any other company.
--
-- WHAT THIS CHANGES, and nothing else:
--
--   employee_sync_runs.woven_company_id         NOT NULL, DEFAULT and CHECK =
--                                               the pinned id. Every run, from
--                                               its claim, is a Midwest Soap
--                                               Makers run.
--   employee_access_directory.woven_company_id  NOT NULL, CHECK = pinned id,
--                                               NO default: a writer must state it.
--   woven_location_map.woven_company_id         NOT NULL, CHECK = pinned id,
--                                               NO default: a writer must state it.
--   employee_sync_commit_run(...)               same signature, same body, plus:
--                                               the commit must STATE the
--                                               company (p_stats.woven_company_id);
--                                               absent, malformed, another
--                                               company, or not the run's own
--                                               company refuses the WHOLE commit
--                                               (one transaction: nothing is
--                                               written). The stated company is
--                                               stamped on every directory and
--                                               location-map row written.
--
-- TABLES REVIEWED AND LEFT AS THEY ARE, and why:
--
--   employee_location_affiliations   child of employee_access_directory
--   employee_directory_changes       (employee_id NOT NULL REFERENCES …
--                                    ON DELETE RESTRICT): each row belongs to
--                                    one directory row, so to its company.
--   woven_position_map               queued only from employees the commit
--                                    has just company-checked; a mapping row
--                                    names a PositionID, not a company. Every
--                                    row's first_seen_run_id is a pinned run.
--   employee_role_overrides,         keyed on app_users, not on Woven rows;
--   employee_account_links,          no Woven company data. Untouched.
--   employee_access_runs / _actions
--
-- WHAT THIS DOES NOT CHANGE: no RLS setting, policy, grant, view, trigger,
-- enum or payload type. Every table here keeps RLS enabled AND forced with no
-- policy, and every privilege stays revoked from anon and authenticated.
-- `create or replace` keeps the commit function's owner and privileges; the
-- revoke below restates them. claim_run and abandon_run are unchanged
-- (claim inserts the pinned company through the column default).
--
-- EXISTING ROWS. At writing (12 Oct 2026) all three tables are empty in the
-- Ask Bubbles project. Should a run have been saved before this is applied,
-- its rows were written only after the token guard proved the pinned company,
-- so they are stamped with it. One transaction: any failure leaves every
-- table exactly as it was.
--
-- DEPLOY ORDER. Either order is safe. Code first: the commit carries an
-- extra p_stats key the old function ignores. Migration first: the old code
-- states no company, so every commit is refused and nothing is saved until
-- the new code ships (the employee sync is off in Production today).
--
-- The pinned id appears below as a literal on purpose: a CHECK must be
-- immutable, and a reviewer should see the one company it allows.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------- the runs ---

alter table public.employee_sync_runs
  add column if not exists woven_company_id uuid;

update public.employee_sync_runs
   set woven_company_id = '55839f24-9241-418c-8405-37baf9a42a87'
 where woven_company_id is null;

alter table public.employee_sync_runs
  alter column woven_company_id set default '55839f24-9241-418c-8405-37baf9a42a87',
  alter column woven_company_id set not null;

alter table public.employee_sync_runs
  drop constraint if exists employee_sync_runs_pinned_company;
alter table public.employee_sync_runs
  add constraint employee_sync_runs_pinned_company
  check (woven_company_id = '55839f24-9241-418c-8405-37baf9a42a87'::uuid);

comment on column public.employee_sync_runs.woven_company_id is
  'The Woven company this run read: always Buff City Soap / Midwest Soap Makers (CHECK). Ask Bubbles reads no other Woven company.';

-- --------------------------------------------------------- the directory ---

alter table public.employee_access_directory
  add column if not exists woven_company_id uuid;

update public.employee_access_directory
   set woven_company_id = '55839f24-9241-418c-8405-37baf9a42a87'
 where woven_company_id is null;

alter table public.employee_access_directory
  alter column woven_company_id set not null;

alter table public.employee_access_directory
  drop constraint if exists employee_access_directory_pinned_company;
alter table public.employee_access_directory
  add constraint employee_access_directory_pinned_company
  check (woven_company_id = '55839f24-9241-418c-8405-37baf9a42a87'::uuid);

comment on column public.employee_access_directory.woven_company_id is
  'The Woven company the employee record named, proved per record by the sync and stated by the commit: always Midwest Soap Makers (CHECK). No default — a writer that does not state it is refused.';

-- ------------------------------------------------------ the location map ---

alter table public.woven_location_map
  add column if not exists woven_company_id uuid;

update public.woven_location_map
   set woven_company_id = '55839f24-9241-418c-8405-37baf9a42a87'
 where woven_company_id is null;

alter table public.woven_location_map
  alter column woven_company_id set not null;

alter table public.woven_location_map
  drop constraint if exists woven_location_map_pinned_company;
alter table public.woven_location_map
  add constraint woven_location_map_pinned_company
  check (woven_company_id = '55839f24-9241-418c-8405-37baf9a42a87'::uuid);

comment on column public.woven_location_map.woven_company_id is
  'The Woven company the location belongs to, proved per record by the sync and stated by the commit: always Midwest Soap Makers (CHECK). No default.';

-- ------------------------------------------------------------ the commit ---

/*
 * `employee_sync_commit_run` from 20260928002000_woven_employee_directory.sql,
 * UNCHANGED except where it reads, checks and stamps the company:
 *   - the run's woven_company_id is read under the same row lock;
 *   - step 0 refuses a commit that does not state the pinned company, or
 *     states one other than the run's;
 *   - the directory upsert and the location-map upsert write it.
 * Same name, arguments and return type, so the caller is unchanged.
 */
create or replace function public.employee_sync_commit_run(
  p_run_id    uuid,
  p_employees jsonb,
  p_changes   jsonb,
  p_locations jsonb,
  p_stats     jsonb
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_status public.employee_sync_run_status;
  v_created integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_missing integer := 0;
  v_changes integer := 0;
  v_expected_changes integer;
  v_run_company uuid;
  v_company uuid;
begin
  select r.status, r.woven_company_id into v_status, v_run_company
    from public.employee_sync_runs r
   where r.id = p_run_id
   for update;

  if not found then
    return jsonb_build_object('status', 'unknown_run');
  end if;
  if v_status <> 'running' then
    return jsonb_build_object('status', 'not_running', 'runStatus', v_status);
  end if;

  if jsonb_typeof(p_employees) <> 'array'
     or jsonb_typeof(p_changes) <> 'array'
     or jsonb_typeof(p_locations) <> 'array'
     or jsonb_typeof(p_stats) <> 'object' then
    raise exception 'employee_sync_commit_run: malformed payload'
      using errcode = 'invalid_parameter_value';
  end if;

  /*
   * ---- 0. the company: Midwest Soap Makers, stated, or nothing is saved ----
   *
   * The sync proves every record it read named the pinned CompanyID and
   * states that company here. Absent, not a GUID, another company, or not
   * the run's own company: the whole commit is refused, every write below is
   * rolled back with it, and the run stays `running` for the caller to
   * abandon. The value is then stamped on every directory and location-map
   * row this run writes, where a CHECK holds it to the pinned company.
   */
  if coalesce(p_stats ->> 'woven_company_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'employee_sync_commit_run: company_scope_violation (no company stated)'
      using errcode = 'check_violation';
  end if;
  v_company := (p_stats ->> 'woven_company_id')::uuid;
  if v_company <> '55839f24-9241-418c-8405-37baf9a42a87'::uuid
     or v_company is distinct from v_run_company then
    raise exception 'employee_sync_commit_run: company_scope_violation (not the pinned company)'
      using errcode = 'check_violation';
  end if;


  /* ---- 1. upsert every employee in the read ---- */
  with written as (
    insert into public.employee_access_directory as d (
      source_system, external_employee_id,
      employee_login_id, external_hris_id,
      first_name, last_name, preferred_first_name, email_address,
      employment_status, employment_status_code,
      hire_date, start_date, termination_date, termination_last_day_worked, termination_type_code,
      position_id, position_name,
      primary_woven_location_id, primary_location_name,
      has_multiple_location_access, has_all_location_access, woven_login_allowed,
      affiliations_verified_at, data_issues, record_hash,
      first_seen_run_id, last_seen_run_id,
      first_seen_at, last_seen_at, last_synced_at, content_changed_at, missing_sync_count,
      woven_company_id
    )
    select
      'woven', i.external_employee_id,
      i.employee_login_id, i.external_hris_id,
      i.first_name, i.last_name, i.preferred_first_name, i.email_address,
      coalesce(i.employment_status, 'unknown'), i.employment_status_code,
      i.hire_date, i.start_date, i.termination_date, i.termination_last_day_worked, i.termination_type_code,
      i.position_id, i.position_name,
      i.primary_woven_location_id, i.primary_location_name,
      i.has_multiple_location_access, i.has_all_location_access, i.woven_login_allowed,
      case when jsonb_typeof(i.affiliations) = 'array' then now() end,
      coalesce(i.data_issues, '{}'), i.record_hash,
      p_run_id, p_run_id,
      now(), now(), now(), now(), 0,
      v_company
    from jsonb_populate_recordset(null::public.employee_sync_incoming, p_employees) i
    on conflict (source_system, external_employee_id) do update set
      employee_login_id            = excluded.employee_login_id,
      external_hris_id             = excluded.external_hris_id,
      first_name                   = excluded.first_name,
      last_name                    = excluded.last_name,
      preferred_first_name         = excluded.preferred_first_name,
      email_address                = excluded.email_address,
      employment_status            = excluded.employment_status,
      employment_status_code       = excluded.employment_status_code,
      hire_date                    = excluded.hire_date,
      start_date                   = excluded.start_date,
      termination_date             = excluded.termination_date,
      termination_last_day_worked  = excluded.termination_last_day_worked,
      termination_type_code        = excluded.termination_type_code,
      position_id                  = excluded.position_id,
      position_name                = excluded.position_name,
      primary_woven_location_id    = excluded.primary_woven_location_id,
      primary_location_name        = excluded.primary_location_name,
      has_multiple_location_access = excluded.has_multiple_location_access,
      has_all_location_access      = excluded.has_all_location_access,
      woven_login_allowed          = excluded.woven_login_allowed,
      affiliations_verified_at     = coalesce(excluded.affiliations_verified_at, d.affiliations_verified_at),
      data_issues                  = excluded.data_issues,
      content_changed_at           = case when d.record_hash is distinct from excluded.record_hash
                                          then now() else d.content_changed_at end,
      record_hash                  = excluded.record_hash,
      last_seen_run_id             = p_run_id,
      last_seen_at                 = now(),
      last_synced_at               = now(),
      missing_sync_count           = 0,
      woven_company_id             = excluded.woven_company_id
    /* now() is the transaction's instant, so "changed in THIS run" is exact. */
    returning (xmax = 0) as inserted, (content_changed_at = now()) as changed
  )
  select count(*) filter (where inserted),
         count(*) filter (where not inserted and changed),
         count(*) filter (where not inserted and not changed)
    into v_created, v_updated, v_unchanged
    from written;

  /* ---- 2. everyone on file who was NOT in the read: kept, and counted ---- */
  update public.employee_access_directory d
     set missing_sync_count = d.missing_sync_count + 1,
         last_synced_at     = now()
   where d.source_system = 'woven'
     and d.last_seen_run_id is distinct from p_run_id;
  get diagnostics v_missing = row_count;

  /* ---- 3. location affiliations ---- */

  /* 3a. A primary that is no longer the primary steps down (still active until a full read says otherwise). */
  update public.employee_location_affiliations a
     set is_primary  = false,
         access_type = 'additional'
    from jsonb_populate_recordset(null::public.employee_sync_incoming, p_employees) i
    join public.employee_access_directory d
      on d.source_system = 'woven' and d.external_employee_id = i.external_employee_id
   where a.employee_id = d.id
     and a.is_primary
     and a.woven_location_id is distinct from i.primary_woven_location_id;

  /* 3b. Full reads: upsert every listed location. */
  insert into public.employee_location_affiliations as a (
    employee_id, woven_location_id, location_name, location_number,
    is_primary, access_type, expires_on, active, ended_at,
    first_seen_run_id, last_seen_run_id, first_seen_at, last_seen_at
  )
  select d.id, l.woven_location_id, l.location_name, l.location_number,
         l.access_type = 'primary', l.access_type, l.expires_on, true, null,
         p_run_id, p_run_id, now(), now()
    from jsonb_populate_recordset(null::public.employee_sync_incoming, p_employees) i
    join public.employee_access_directory d
      on d.source_system = 'woven' and d.external_employee_id = i.external_employee_id
    cross join lateral jsonb_to_recordset(i.affiliations) as l(
      woven_location_id text,
      location_name     text,
      location_number   text,
      access_type       public.employee_location_access_type,
      expires_on        date
    )
   where jsonb_typeof(i.affiliations) = 'array'
  on conflict (employee_id, woven_location_id) do update set
    location_name    = excluded.location_name,
    location_number  = excluded.location_number,
    is_primary       = excluded.is_primary,
    access_type      = excluded.access_type,
    expires_on       = excluded.expires_on,
    active           = true,
    ended_at         = null,
    last_seen_run_id = p_run_id,
    last_seen_at     = now();

  /* 3c. Full reads: anything active but not listed has ended. Never on a partial read. */
  update public.employee_location_affiliations a
     set active = false,
         ended_at = now(),
         is_primary = false,
         access_type = case when a.access_type = 'primary' then 'additional' else a.access_type end
    from jsonb_populate_recordset(null::public.employee_sync_incoming, p_employees) i
    join public.employee_access_directory d
      on d.source_system = 'woven' and d.external_employee_id = i.external_employee_id
   where a.employee_id = d.id
     and a.active
     and jsonb_typeof(i.affiliations) = 'array'
     and not exists (
       select 1 from jsonb_to_recordset(i.affiliations) as l(woven_location_id text)
        where l.woven_location_id = a.woven_location_id
     );

  /* 3d. Partial reads: the list endpoint still states the primary, so assert it. */
  insert into public.employee_location_affiliations as a (
    employee_id, woven_location_id, location_name,
    is_primary, access_type, active, ended_at,
    first_seen_run_id, last_seen_run_id, first_seen_at, last_seen_at
  )
  select d.id, i.primary_woven_location_id, i.primary_location_name,
         true, 'primary', true, null,
         p_run_id, p_run_id, now(), now()
    from jsonb_populate_recordset(null::public.employee_sync_incoming, p_employees) i
    join public.employee_access_directory d
      on d.source_system = 'woven' and d.external_employee_id = i.external_employee_id
   where jsonb_typeof(i.affiliations) is distinct from 'array'
     and i.primary_woven_location_id is not null
  on conflict (employee_id, woven_location_id) do update set
    location_name    = coalesce(excluded.location_name, a.location_name),
    is_primary       = true,
    access_type      = 'primary',
    expires_on       = null,
    active           = true,
    ended_at         = null,
    last_seen_run_id = p_run_id,
    last_seen_at     = now();

  /* 3e. The directory's filter array follows the table. */
  update public.employee_access_directory d
     set woven_location_ids = coalesce((
           select array_agg(a.woven_location_id order by a.is_primary desc, a.woven_location_id)
             from public.employee_location_affiliations a
            where a.employee_id = d.id and a.active
         ), '{}')
   where d.last_seen_run_id = p_run_id;

  /* ---- 4. the changes, each tied to its employee row ---- */
  v_expected_changes := jsonb_array_length(p_changes);

  insert into public.employee_directory_changes (
    employee_id, sync_run_id, change_kind, field_name,
    from_value, to_value, classification, effective_date, details
  )
  select d.id, p_run_id, c.change_kind, c.field_name,
         c.from_value, c.to_value, c.classification, c.effective_date, coalesce(c.details, '{}'::jsonb)
    from jsonb_to_recordset(p_changes) as c(
      external_employee_id text,
      change_kind          public.employee_directory_change_kind,
      field_name           text,
      from_value           jsonb,
      to_value             jsonb,
      classification       text,
      effective_date       date,
      details              jsonb
    )
    join public.employee_access_directory d
      on d.source_system = 'woven'
     and d.external_employee_id = c.external_employee_id;
  get diagnostics v_changes = row_count;

  if v_changes <> v_expected_changes then
    raise exception 'employee_sync_commit_run: % change(s) name no employee in the directory',
      v_expected_changes - v_changes
      using errcode = 'foreign_key_violation';
  end if;

  /* ---- 5. the location catalog: queue new ones, refresh facts, never touch a mapping ---- */
  insert into public.woven_location_map as m (
    woven_location_id, woven_location_name, woven_display_name, woven_location_number,
    woven_district_id, woven_district_name, woven_region_id, woven_region_name,
    is_closed, is_non_location, suggested_location_id, first_seen_run_id,
    woven_company_id
  )
  select l.woven_location_id, l.woven_location_name, l.woven_display_name, l.woven_location_number,
         l.woven_district_id, l.woven_district_name, l.woven_region_id, l.woven_region_name,
         l.is_closed, l.is_non_location,
         case when l.suggested_location_id ~ '^loc-[A-Za-z0-9-]{1,16}$' then l.suggested_location_id end,
         p_run_id,
         v_company
    from jsonb_to_recordset(p_locations) as l(
      woven_location_id     text,
      woven_location_name   text,
      woven_display_name    text,
      woven_location_number text,
      woven_district_id     text,
      woven_district_name   text,
      woven_region_id       text,
      woven_region_name     text,
      is_closed             boolean,
      is_non_location       boolean,
      suggested_location_id text
    )
   where l.woven_location_id is not null
  on conflict (woven_location_id) do update set
    last_seen_at          = now(),
    woven_location_name   = coalesce(excluded.woven_location_name, m.woven_location_name),
    woven_display_name    = coalesce(excluded.woven_display_name, m.woven_display_name),
    woven_location_number = coalesce(excluded.woven_location_number, m.woven_location_number),
    woven_district_id     = coalesce(excluded.woven_district_id, m.woven_district_id),
    woven_district_name   = coalesce(excluded.woven_district_name, m.woven_district_name),
    woven_region_id       = coalesce(excluded.woven_region_id, m.woven_region_id),
    woven_region_name     = coalesce(excluded.woven_region_name, m.woven_region_name),
    is_closed             = coalesce(excluded.is_closed, m.is_closed),
    is_non_location       = coalesce(excluded.is_non_location, m.is_non_location),
    suggested_location_id = coalesce(excluded.suggested_location_id, m.suggested_location_id),
    woven_company_id      = excluded.woven_company_id;

  /* ---- 6. queue every position seen; never touch a mapping ---- */
  insert into public.woven_position_map as p (woven_position_id, woven_position_name, first_seen_run_id)
  select distinct on (i.position_id) i.position_id, i.position_name, p_run_id
    from jsonb_populate_recordset(null::public.employee_sync_incoming, p_employees) i
   where i.position_id is not null
   order by i.position_id, i.position_name nulls last
  on conflict (woven_position_id) do update set
    last_seen_at        = now(),
    woven_position_name = coalesce(excluded.woven_position_name, p.woven_position_name);

  /* ---- 7. close the run ---- */
  update public.employee_sync_runs r
     set status                   = 'succeeded',
         finished_at              = now(),
         requests_made            = coalesce((p_stats ->> 'requests_made')::integer, 0),
         pages_fetched            = coalesce((p_stats ->> 'pages_fetched')::integer, 0),
         employees_received       = coalesce((p_stats ->> 'employees_received')::integer, 0),
         employees_active         = coalesce((p_stats ->> 'employees_active')::integer, 0),
         employees_terminated     = coalesce((p_stats ->> 'employees_terminated')::integer, 0),
         employees_status_unknown = coalesce((p_stats ->> 'employees_status_unknown')::integer, 0),
         details_fetched          = coalesce((p_stats ->> 'details_fetched')::integer, 0),
         details_skipped          = coalesce((p_stats ->> 'details_skipped')::integer, 0),
         records_rejected         = coalesce((p_stats ->> 'records_rejected')::integer, 0),
         issue_counts             = coalesce(p_stats -> 'issue_counts', '{}'::jsonb),
         employees_created        = v_created,
         employees_updated        = v_updated,
         employees_unchanged      = v_unchanged,
         employees_missing        = v_missing,
         changes_recorded         = v_changes,
         unmapped_locations       = (select count(*) from public.woven_location_map m where m.status = 'unmapped'),
         unmapped_positions       = (select count(*) from public.woven_position_map p where p.status = 'unmapped')
   where r.id = p_run_id;

  return jsonb_build_object(
    'status',    'committed',
    'created',   v_created,
    'updated',   v_updated,
    'unchanged', v_unchanged,
    'missing',   v_missing,
    'changes',   v_changes
  );
end;
$$;

revoke all on function public.employee_sync_commit_run(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
