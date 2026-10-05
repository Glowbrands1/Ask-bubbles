-- ============================================================================
-- THE REPORTING FRAMEWORK — company-neutral lineage, no report families
-- ============================================================================
--
-- Every ingested report is stored the same way, whatever it contains:
--
--   report_sources     who delivers reports (one row per producer)
--   report_files       every raw artifact received, sha256-addressed,
--                      idempotent on (source, external_message_id)
--   report_periods     the reporting calendar, unique on (grain, period_end)
--   report_ingestions  every parse ATTEMPT, including failures, with at most
--                      one success per (file, parser, version)
--   report_metrics     the controlled vocabulary of measures (empty)
--
-- A company report FAMILY adds its own fact table, a
-- `complete_<family>_ingestion` RPC and its sources/metrics rows in a migration
-- of its own. Buff City Soap has none yet, so none is created or seeded here.
--
-- SERVER-ONLY. Nothing in the browser reads these relations: every reporting
-- read goes through the secret key in a `server-only` module, where location
-- scope is enforced. So the browser roles get no grant and no policy — RLS is
-- enabled and FORCED with nothing to satisfy it — and there is no second door
-- whose rule could drift from the application's.

create type public.report_source_kind as enum (
  'email_attachment',
  'manual_upload',
  'api'
);

create type public.report_period_grain as enum (
  'day', 'week', 'month', 'quarter', 'year', 'mtd', 'ytd', 'ltm'
);

create type public.report_ingestion_status as enum (
  'received',           -- bytes stored, not yet parsed
  'parsing',
  'succeeded',
  'failed',             -- parsed and rejected; failure_reason says why
  'rejected_duplicate'  -- an idempotency layer matched an earlier ingestion
);

create type public.report_metric_unit as enum (
  'currency',   -- money. Sums.
  'count',      -- whole things. Sums.
  'hours',      -- labour hours. Sums.
  'ratio',      -- per-unit averages. Does NOT sum.
  'percent',    -- stored as a FRACTION: -0.0299 means -2.99%. Does NOT sum.
  'rank',       -- ordinal position. Does NOT sum or average.
  'years'       -- durations. Does NOT sum.
);

-- ---------------------------------------------------------------- sources --
create table public.report_sources (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null,
  name text not null,
  kind public.report_source_kind not null,
  report_family text not null,
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_sources_code_key unique (code),
  constraint report_sources_code_format check (code ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint report_sources_family_format check (report_family ~ '^[a-z][a-z0-9_]{2,63}$')
);

create trigger report_sources_touch_updated_at
  before update on public.report_sources
  for each row execute function public.touch_updated_at();

comment on table public.report_sources is
  'Upstream systems that deliver reports. One row per producer, not per file.';

-- ------------------------------------------------------------------ files --
create table public.report_files (
  id uuid primary key default extensions.gen_random_uuid(),
  source_id uuid not null references public.report_sources (id),
  storage_bucket text not null default 'reporting-sources',
  storage_path   text not null,
  original_filename text not null,
  mime_type         text not null,
  size_bytes        bigint not null check (size_bytes >= 0),
  file_sha256 text not null,
  external_message_id text,
  external_archive_url text,
  sender_email text,
  inbound_email_id text,
  received_at timestamptz not null default now(),
  received_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint report_files_sha256_key unique (file_sha256),
  constraint report_files_storage_object_key unique (storage_bucket, storage_path),
  constraint report_files_sha256_format check (file_sha256 ~ '^[0-9a-f]{64}$'),
  constraint report_files_storage_path_not_blank check (btrim(storage_path) <> '')
);

create unique index report_files_source_message_key
  on public.report_files (source_id, external_message_id)
  where external_message_id is not null;
create index report_files_received_idx on public.report_files (received_at desc);
create index report_files_source_idx on public.report_files (source_id, received_at desc);

comment on table public.report_files is
  'One row per raw artifact received. Separate from report_ingestions because having the bytes and having understood them are different facts.';
comment on column public.report_files.file_sha256 is
  'Idempotency layer 1. Lowercase hex SHA-256 of the bytes as received.';
comment on column public.report_files.external_archive_url is
  'Lineage only. Never fetched by the server.';
comment on column public.report_files.sender_email is
  'Sending address as reported by the intake caller. Lineage only; never used for authorization.';

-- ---------------------------------------------------------------- periods --
create table public.report_periods (
  id uuid primary key default extensions.gen_random_uuid(),
  grain public.report_period_grain not null,
  period_end   date not null,
  period_start date not null,
  fiscal_year integer not null,
  label_raw text not null,
  created_at timestamptz not null default now(),
  constraint report_periods_grain_end_key unique (grain, period_end),
  constraint report_periods_range check (period_start <= period_end),
  constraint report_periods_label_not_blank check (btrim(label_raw) <> '')
);

create index report_periods_end_idx on public.report_periods (period_end desc);

comment on table public.report_periods is
  'The reporting calendar. Uniqueness on (grain, period_end) keeps successive as-of dates independently queryable.';

-- ------------------------------------------------------------- ingestions --
create table public.report_ingestions (
  id uuid primary key default extensions.gen_random_uuid(),
  file_id   uuid not null references public.report_files (id),
  source_id uuid not null references public.report_sources (id),
  parser_key     text not null,
  parser_version integer not null check (parser_version >= 1),
  status public.report_ingestion_status not null default 'received',
  period_id uuid references public.report_periods (id),
  period_scoped boolean not null default true,
  fingerprint text not null,
  source_sheet_names text[] not null default '{}',
  fact_count     integer not null default 0 check (fact_count >= 0),
  location_count integer not null default 0 check (location_count >= 0),
  warnings text[] not null default '{}',
  failure_reason text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint report_ingestions_parser_key_format check (parser_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint report_ingestions_fingerprint_format check (fingerprint ~ '^[0-9a-f]{64}$'),
  constraint report_ingestions_succeeded_requires_period check (
    status <> 'succeeded'
    or (finished_at is not null and (period_scoped = false or period_id is not null))
  ),
  constraint report_ingestions_failed_requires_reason
    check (status <> 'failed' or failure_reason is not null)
);

create unique index report_ingestions_one_success_key
  on public.report_ingestions (file_id, parser_key, parser_version)
  where status = 'succeeded';
create index report_ingestions_file_idx on public.report_ingestions (file_id, started_at desc);
create index report_ingestions_period_idx on public.report_ingestions (period_id);
create index report_ingestions_fingerprint_idx on public.report_ingestions (fingerprint);
create index report_ingestions_open_idx
  on public.report_ingestions (started_at desc)
  where status in ('received', 'parsing', 'failed');

comment on table public.report_ingestions is
  'One row per parse ATTEMPT, including failures. At most one attempt per (file, parser, version) may succeed.';
comment on column public.report_ingestions.period_scoped is
  'Whether this family attributes facts to a report_periods row. Defaults true so a family must opt out deliberately.';

-- ---------------------------------------------------------------- metrics --
create table public.report_metrics (
  id uuid primary key default extensions.gen_random_uuid(),
  report_family text not null,
  code text not null,
  label text not null,
  unit public.report_metric_unit not null,
  higher_is_better boolean,
  created_at timestamptz not null default now(),
  constraint report_metrics_family_code_key unique (report_family, code),
  constraint report_metrics_code_format check (code ~ '^[a-z][a-z0-9_]{1,63}$')
);

comment on table public.report_metrics is
  'The controlled vocabulary of measures, per report family. Empty until a family is added.';

-- ----------------------------------------------------------------- bucket --
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reporting-sources',
  'reporting-sources',
  false,
  52428800,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/vnd.ms-excel',
    'text/csv'
  ]
)
on conflict (id) do nothing;

-- ------------------------------------------------------------------- RPCs --
create or replace function public.begin_report_ingestion(
  p_source_code    text,
  p_file           jsonb,
  p_parser_key     text,
  p_parser_version integer,
  p_fingerprint    text,
  p_sheet_names    text[]
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_source_id    uuid;
  v_file_id      uuid;
  v_existing     uuid;
  v_ingestion_id uuid;
  v_file_created boolean := false;
begin
  select id into v_source_id
  from public.report_sources
  where code = p_source_code and active
  for update;

  if v_source_id is null then
    raise exception 'Unknown or inactive report source: %', p_source_code
      using errcode = 'no_data_found';
  end if;

  insert into public.report_files (
    source_id, storage_bucket, storage_path, original_filename, mime_type,
    size_bytes, file_sha256, external_message_id, external_archive_url,
    sender_email, received_at, inbound_email_id
  )
  values (
    v_source_id,
    coalesce(p_file->>'storage_bucket', 'reporting-sources'),
    p_file->>'storage_path',
    p_file->>'original_filename',
    p_file->>'mime_type',
    (p_file->>'size_bytes')::bigint,
    p_file->>'file_sha256',
    p_file->>'external_message_id',
    p_file->>'external_archive_url',
    p_file->>'sender_email',
    coalesce((p_file->>'received_at')::timestamptz, now()),
    p_file->>'inbound_email_id'
  )
  on conflict (file_sha256) do nothing
  returning id into v_file_id;

  if v_file_id is null then
    select id into v_file_id from public.report_files where file_sha256 = p_file->>'file_sha256';
  else
    v_file_created := true;
  end if;

  select id into v_existing
  from public.report_ingestions
  where file_id = v_file_id
    and parser_key = p_parser_key
    and parser_version = p_parser_version
    and status = 'succeeded'
  limit 1;

  if v_existing is not null then
    return jsonb_build_object(
      'status', 'already_ingested',
      'file_id', v_file_id,
      'file_created', v_file_created,
      'ingestion_id', v_existing
    );
  end if;

  insert into public.report_ingestions (
    file_id, source_id, parser_key, parser_version, status, fingerprint, source_sheet_names
  )
  values (
    v_file_id, v_source_id, p_parser_key, p_parser_version, 'parsing',
    p_fingerprint, coalesce(p_sheet_names, '{}')
  )
  returning id into v_ingestion_id;

  return jsonb_build_object(
    'status', 'opened',
    'file_id', v_file_id,
    'file_created', v_file_created,
    'ingestion_id', v_ingestion_id
  );
end;
$$;

comment on function public.begin_report_ingestion(text, jsonb, text, integer, text, text[]) is
  'Registers the source file and opens one ingestion attempt in the ''parsing'' state, or reports already_ingested for (file, parser, version).';

create or replace function public.fail_report_ingestion(
  p_ingestion_id uuid,
  p_reason       text
) returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  update public.report_ingestions
     set status = 'failed',
         failure_reason = coalesce(nullif(btrim(p_reason), ''), 'Ingestion failed.'),
         finished_at = now()
   where id = p_ingestion_id
     and status <> 'succeeded';

  return jsonb_build_object('status', 'failed', 'ingestion_id', p_ingestion_id);
end;
$$;

comment on function public.fail_report_ingestion(uuid, text) is
  'Marks an attempt failed with a user-safe reason. Never overwrites a succeeded attempt.';

revoke all on function public.begin_report_ingestion(text, jsonb, text, integer, text, text[]) from public, anon, authenticated;
revoke all on function public.fail_report_ingestion(uuid, text) from public, anon, authenticated;
grant execute on function public.begin_report_ingestion(text, jsonb, text, integer, text, text[]) to service_role;
grant execute on function public.fail_report_ingestion(uuid, text) to service_role;

-- ----------------------------------------------------- server-only posture --
alter table public.report_sources    enable row level security;
alter table public.report_files      enable row level security;
alter table public.report_periods    enable row level security;
alter table public.report_ingestions enable row level security;
alter table public.report_metrics    enable row level security;

alter table public.report_sources    force row level security;
alter table public.report_files      force row level security;
alter table public.report_periods    force row level security;
alter table public.report_ingestions force row level security;
alter table public.report_metrics    force row level security;

revoke all on public.report_sources    from anon, authenticated;
revoke all on public.report_files      from anon, authenticated;
revoke all on public.report_periods    from anon, authenticated;
revoke all on public.report_ingestions from anon, authenticated;
revoke all on public.report_metrics    from anon, authenticated;
