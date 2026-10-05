-- ============================================================================
-- ADOPTION ANALYTICS — one event table, the unified view, and the aggregates.
-- ============================================================================
--
-- WHAT THIS IS FOR. Management needs to know who is using Ask Bubbles, from
-- which location, how often and what for — and, more actionable, who is not.
--
-- WHAT IS RECORDED HERE. Only acts that leave no other trace: a chat turn, a
-- knowledge search, a report analysis. A filed form, an uploaded document and
-- an ingested report already leave an attributed row in their own tables, and
-- `activity_unified` reads them where they live rather than copying them.
--
-- WHAT IS NEVER RECORDED: the question or the answer. There is no column for
-- either. Chat turns are classified in memory on the server and only the
-- category is stored.
--
-- LOCATIONS ARE TEXT IDS (`loc-<code>`), the same ids the application's
-- location roster (src/config/company/locations.ts) and `app_users` scope use.
-- There is no locations table in the database: the roster is configuration,
-- and district/region filters are resolved to a list of location ids in the
-- application before any function here is called. `p_locations` is therefore
-- the only location filter: NULL means "no filter", an array means "only
-- these", and an EMPTY array matches nothing (an area with no known
-- locations shows nothing, it never widens to everything).
--
-- SERVER-ONLY. Every relation and function here is revoked from the browser
-- roles; the admin-gated analytics screens read it with the secret key.

create type public.activity_feature as enum ('chat', 'forms', 'knowledge', 'reports');

-- Mirrors ACTIVITY_CATEGORIES in src/lib/analytics/taxonomy.ts.
create type public.activity_category as enum (
  'form_created',
  'form_request',
  'team_guidance',
  'policy_question',
  'store_operations',
  'equipment_procedures',
  'training',
  'guest_experience',
  'pay_benefits',
  'safety_compliance',
  'hiring_onboarding',
  'reporting',
  'report_analysis',
  'report_upload',
  'document_upload',
  'document_search',
  'general_guidance',
  'unclassified'
);

-- Mirrors ACTIVITY_SURFACES. `unknown` is the honest value for a caller that
-- did not say; a new surface adds a member rather than borrowing one.
create type public.activity_surface as enum ('main_chat', 'overview', 'report', 'unknown');

-- Whether a chat turn carried a question or only an acknowledgement ("yes",
-- "thanks"). Acknowledgements count as usage and are left out of topic counts.
create type public.activity_turn_kind as enum ('question', 'acknowledgement', 'not_applicable');

create table public.activity_events (
  id uuid primary key default extensions.gen_random_uuid(),
  -- Server time only; a caller cannot backdate activity.
  occurred_at timestamptz not null default now(),
  -- set null, not cascade: deleting a person must not delete that the act happened.
  actor_user_id uuid references auth.users (id) on delete set null,
  -- The role AT THE TIME, denormalised on purpose so a promotion does not
  -- rewrite historical usage-by-role.
  actor_role public.app_user_role,
  feature public.activity_feature not null,
  category public.activity_category not null,
  surface public.activity_surface,
  turn_kind public.activity_turn_kind,
  -- From the actor's account scope, never from anything typed.
  location_id text check (location_id is null or location_id ~ '^loc-[A-Za-z0-9-]{1,16}$'),
  succeeded boolean not null default true,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now()
);

comment on table public.activity_events is
  'Adoption events for acts that leave no other trace (chat turns, knowledge searches, report analyses). Carries NO prompt, answer or question text — there is no column for one.';
comment on column public.activity_events.location_id is
  'The actor''s primary location id (loc-<code>) at the time of the act, from their account scope. Null for a global-scope actor.';

create index activity_events_occurred_at on public.activity_events (occurred_at desc);
create index activity_events_actor       on public.activity_events (actor_user_id, occurred_at desc);
create index activity_events_location    on public.activity_events (location_id, occurred_at desc);
create index activity_events_category    on public.activity_events (category, occurred_at desc);
create index activity_events_surface     on public.activity_events (surface, occurred_at desc);

alter table public.activity_events enable row level security;
alter table public.activity_events force  row level security;
revoke all on public.activity_events from anon, authenticated;
-- No policy: RLS with no policy denies every role that does not bypass it.

-- ---------------------------------------------------------- the union ------
-- One shape over both halves. security_invoker, so it grants nothing the
-- underlying tables refuse.
create view public.activity_unified
with (security_invoker = true) as
  select
    e.id as event_id,
    e.occurred_at,
    e.actor_user_id,
    e.actor_role,
    e.feature,
    e.category,
    e.location_id,
    e.succeeded,
    e.surface,
    e.turn_kind
  from public.activity_events e

  union all

  -- Filed forms. `created_by` is text, cast only when it is a uuid.
  select
    null::uuid,
    i.created_at,
    case
      when i.created_by ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then i.created_by::uuid
    end,
    null::public.app_user_role,
    'forms'::public.activity_feature,
    'form_created'::public.activity_category,
    case when i.location_id ~ '^loc-[A-Za-z0-9-]{1,16}$' then i.location_id end,
    true,
    null::public.activity_surface,
    'not_applicable'::public.activity_turn_kind
  from public.form_instances i

  union all

  select
    null::uuid,
    d.created_at,
    d.uploaded_by,
    null::public.app_user_role,
    'knowledge'::public.activity_feature,
    'document_upload'::public.activity_category,
    null::text,
    true,
    null::public.activity_surface,
    'not_applicable'::public.activity_turn_kind
  from public.knowledge_documents d

  union all

  -- Report ingestion is machine work, so its actor is null by nature.
  select
    null::uuid,
    r.created_at,
    null::uuid,
    null::public.app_user_role,
    'reports'::public.activity_feature,
    'report_upload'::public.activity_category,
    null::text,
    r.status = 'succeeded',
    null::public.activity_surface,
    'not_applicable'::public.activity_turn_kind
  from public.report_ingestions r;

comment on view public.activity_unified is
  'Every recorded act in one shape: activity_events plus form_instances, knowledge_documents and report_ingestions read where they live.';

-- ------------------------------------------------- the leader directory ----
-- Every application user, with their primary location from their account
-- scope. A location-scoped account's primary area IS its location; a wider
-- scope has no single location.
create view public.leader_directory
with (security_invoker = true) as
select
  u.id                    as user_id,
  u.display_name,
  u.email,
  u.role,
  u.status,
  u.scope_level,
  u.scope_primary_area_id,
  u.created_at            as joined_at,
  case when u.scope_level = 'location' then u.scope_primary_area_id end as location_id
from public.app_users u;

comment on view public.leader_directory is
  'Every application user with role, status and primary location (location-scoped accounts only). The authoritative roster for analytics, including people who have never used the product.';

-- ------------------------------------------------ attribution, once --------
-- An event's own location wins; otherwise the actor's account location. The
-- recorded role wins; otherwise the account's current role.
create view public.activity_attributed
with (security_invoker = true) as
select
  e.event_id,
  e.occurred_at,
  e.actor_user_id,
  coalesce(e.actor_role, u.role)          as role,
  e.feature,
  e.category,
  coalesce(e.location_id, u.location_id)  as location_id,
  e.succeeded,
  e.surface,
  e.turn_kind
from public.activity_unified e
left join public.leader_directory u on u.user_id = e.actor_user_id;

comment on view public.activity_attributed is
  'activity_unified with a location and role resolved for every row. The single source every analytics function reads.';

revoke all on public.activity_unified    from anon, authenticated;
revoke all on public.leader_directory    from anon, authenticated;
revoke all on public.activity_attributed from anon, authenticated;

-- ---------------------------------------------------------- aggregates -----
-- Every function takes the same filter signature; null means "do not filter".

create function public.analytics_totals(
  p_from      timestamptz,
  p_to        timestamptz,
  p_locations text[] default null,
  p_role      public.app_user_role default null,
  p_actor     uuid   default null
)
returns table (
  events           bigint,
  active_users     bigint,
  active_locations bigint,
  forms            bigint,
  documents        bigint,
  reports          bigint,
  chat_events      bigint,
  failures         bigint
)
language sql
stable
set search_path = public, extensions
as $$
  select
    count(*),
    count(distinct a.actor_user_id),
    count(distinct a.location_id),
    count(*) filter (where a.feature = 'forms'),
    count(*) filter (where a.category = 'document_upload'),
    count(*) filter (where a.feature = 'reports'),
    count(*) filter (where a.feature = 'chat'),
    count(*) filter (where not a.succeeded)
  from public.activity_attributed a
  where a.occurred_at >= p_from
    and a.occurred_at <  p_to
    and (p_locations is null or a.location_id = any (p_locations))
    and (p_role  is null or a.role          = p_role)
    and (p_actor is null or a.actor_user_id = p_actor);
$$;

create function public.analytics_trend(
  p_from      timestamptz,
  p_to        timestamptz,
  p_bucket    text   default 'day',
  p_locations text[] default null,
  p_role      public.app_user_role default null,
  p_actor     uuid   default null
)
returns table (bucket_start date, events bigint, active_users bigint)
language sql
stable
set search_path = public, extensions
as $$
  -- The bucket is whitelisted, never interpolated.
  select
    date_trunc(
      case when p_bucket in ('day', 'week', 'month') then p_bucket else 'day' end,
      a.occurred_at
    )::date,
    count(*),
    count(distinct a.actor_user_id)
  from public.activity_attributed a
  where a.occurred_at >= p_from
    and a.occurred_at <  p_to
    and (p_locations is null or a.location_id = any (p_locations))
    and (p_role  is null or a.role          = p_role)
    and (p_actor is null or a.actor_user_id = p_actor)
  group by 1
  order by 1;
$$;

create function public.analytics_breakdown(
  p_dimension text,
  p_from      timestamptz,
  p_to        timestamptz,
  p_locations text[] default null,
  p_role      public.app_user_role default null,
  p_actor     uuid   default null
)
returns table (key text, events bigint, active_users bigint, active_locations bigint)
language sql
stable
set search_path = public, extensions
as $$
  select k.key, count(*), count(distinct k.actor_user_id), count(distinct k.location_id)
  from (
    select
      case p_dimension
        when 'role'    then a.role::text
        when 'feature' then a.feature::text
        else                a.category::text
      end as key,
      a.actor_user_id,
      a.location_id
    from public.activity_attributed a
    where a.occurred_at >= p_from
      and a.occurred_at <  p_to
      and (p_locations is null or a.location_id = any (p_locations))
      and (p_role  is null or a.role          = p_role)
      and (p_actor is null or a.actor_user_id = p_actor)
  ) k
  where k.key is not null
  group by k.key
  order by 2 desc;
$$;

create function public.analytics_leaders(
  p_from      timestamptz,
  p_to        timestamptz,
  p_locations text[] default null,
  p_role      public.app_user_role default null,
  p_actor     uuid   default null
)
returns table (
  user_id      uuid,
  display_name text,
  role         public.app_user_role,
  status       public.app_user_status,
  location_id  text,
  events       bigint,
  forms        bigint,
  documents    bigint,
  chat_events  bigint,
  top_category text,
  last_active  timestamptz
)
language sql
stable
set search_path = public, extensions
as $$
  -- LEFT JOIN from the directory, so people with no activity come back with
  -- zeros — the rows an adoption push needs.
  with scoped as (
    select a.*
    from public.activity_attributed a
    where a.occurred_at >= p_from
      and a.occurred_at <  p_to
      and (p_locations is null or a.location_id = any (p_locations))
  )
  select
    l.user_id,
    l.display_name,
    l.role,
    l.status,
    l.location_id,
    count(e.occurred_at),
    count(e.occurred_at) filter (where e.feature = 'forms'),
    count(e.occurred_at) filter (where e.category = 'document_upload'),
    count(e.occurred_at) filter (where e.feature = 'chat'),
    (
      select x.category::text
      from scoped x
      where x.actor_user_id = l.user_id
      group by x.category
      order by count(*) desc, x.category::text
      limit 1
    ),
    max(e.occurred_at)
  from public.leader_directory l
  left join scoped e on e.actor_user_id = l.user_id
  where (p_locations is null or l.location_id = any (p_locations))
    and (p_role  is null or l.role    = p_role)
    and (p_actor is null or l.user_id = p_actor)
  group by l.user_id, l.display_name, l.role, l.status, l.location_id
  order by 6 desc, l.display_name;
$$;

create function public.analytics_locations(
  p_from      timestamptz,
  p_to        timestamptz,
  p_locations text[] default null,
  p_role      public.app_user_role default null,
  p_actor     uuid   default null
)
returns table (
  location_id      text,
  events           bigint,
  active_leaders   bigint,
  assigned_leaders bigint,
  forms            bigint,
  reports          bigint,
  top_category     text,
  last_active      timestamptz
)
language sql
stable
set search_path = public, extensions
as $$
  -- One row per location that has activity OR assigned people. Locations in
  -- the configured roster with neither are added, with zeros, by the
  -- application, which owns the roster.
  with scoped as (
    select a.*
    from public.activity_attributed a
    where a.occurred_at >= p_from
      and a.occurred_at <  p_to
      and a.location_id is not null
      and (p_role  is null or a.role          = p_role)
      and (p_actor is null or a.actor_user_id = p_actor)
  ),
  known as (
    select s.location_id from scoped s
    union
    select l.location_id from public.leader_directory l
    where l.location_id is not null and (p_role is null or l.role = p_role)
  )
  select
    k.location_id,
    count(e.occurred_at),
    count(distinct e.actor_user_id),
    (
      select count(*) from public.leader_directory l
      where l.location_id = k.location_id
        and (p_role is null or l.role = p_role)
    ),
    count(e.occurred_at) filter (where e.feature = 'forms'),
    count(e.occurred_at) filter (where e.feature = 'reports'),
    (
      select x.category::text
      from scoped x
      where x.location_id = k.location_id
      group by x.category
      order by count(*) desc, x.category::text
      limit 1
    ),
    max(e.occurred_at)
  from known k
  left join scoped e on e.location_id = k.location_id
  where (p_locations is null or k.location_id = any (p_locations))
  group by k.location_id
  order by 2 desc, k.location_id;
$$;

revoke all on function public.analytics_totals(timestamptz, timestamptz, text[], public.app_user_role, uuid)          from public, anon, authenticated;
revoke all on function public.analytics_trend(timestamptz, timestamptz, text, text[], public.app_user_role, uuid)     from public, anon, authenticated;
revoke all on function public.analytics_breakdown(text, timestamptz, timestamptz, text[], public.app_user_role, uuid) from public, anon, authenticated;
revoke all on function public.analytics_leaders(timestamptz, timestamptz, text[], public.app_user_role, uuid)         from public, anon, authenticated;
revoke all on function public.analytics_locations(timestamptz, timestamptz, text[], public.app_user_role, uuid)       from public, anon, authenticated;
grant execute on function public.analytics_totals(timestamptz, timestamptz, text[], public.app_user_role, uuid)          to service_role;
grant execute on function public.analytics_trend(timestamptz, timestamptz, text, text[], public.app_user_role, uuid)     to service_role;
grant execute on function public.analytics_breakdown(text, timestamptz, timestamptz, text[], public.app_user_role, uuid) to service_role;
grant execute on function public.analytics_leaders(timestamptz, timestamptz, text[], public.app_user_role, uuid)         to service_role;
grant execute on function public.analytics_locations(timestamptz, timestamptz, text[], public.app_user_role, uuid)       to service_role;
