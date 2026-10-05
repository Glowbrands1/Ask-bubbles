-- ============================================================================
-- ASSISTANT FEEDBACK — one rating per user per answered turn, and its reads.
-- ============================================================================
--
-- Keyed to `activity_events.id`, the server-minted turn id returned with the
-- answer. A caller may only rate an event whose actor is themselves (enforced
-- by the application, which writes with the secret key). The row carries no
-- question and no answer text; role, location, surface and topic come from
-- the joined event. Hiding is a soft delete — there is no hard one.
--
-- SERVER-ONLY, like every analytics relation: RLS forced, no browser grants.

create type public.feedback_status  as enum ('pending', 'in_review', 'resolved', 'dismissed');
create type public.feedback_outcome as enum ('yes', 'partially', 'no');

create table public.assistant_feedback (
  id uuid primary key default extensions.gen_random_uuid(),
  activity_event_id uuid not null references public.activity_events (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  -- Optional: null when the person rated and did not answer.
  got_what_needed public.feedback_outcome,
  -- Optional free text; null rather than an empty string.
  comment text check (comment is null or (length(btrim(comment)) > 0 and length(comment) <= 2000)),
  client_conversation_id text check (client_conversation_id is null or length(client_conversation_id) <= 128),
  client_message_id      text check (client_message_id is null or length(client_message_id) <= 128),
  status public.feedback_status not null default 'pending',
  resolution_note text check (resolution_note is null or length(resolution_note) <= 2000),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  hidden_at timestamptz,
  hidden_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_feedback_one_per_user_per_turn unique (activity_event_id, user_id)
);

comment on table public.assistant_feedback is
  'One rating, optional outcome and optional comment per user per answered assistant turn, keyed to activity_events.id. No question or answer text. Hiding is a soft delete.';

create index assistant_feedback_created_at on public.assistant_feedback (created_at desc);
create index assistant_feedback_status     on public.assistant_feedback (status, created_at desc);
create index assistant_feedback_event      on public.assistant_feedback (activity_event_id);
create index assistant_feedback_user       on public.assistant_feedback (user_id, created_at desc);

create function public.assistant_feedback_touch()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.assistant_feedback_touch() from public, anon, authenticated;

create trigger assistant_feedback_touch
  before update on public.assistant_feedback
  for each row execute function public.assistant_feedback_touch();

alter table public.assistant_feedback enable row level security;
alter table public.assistant_feedback force  row level security;
revoke all on public.assistant_feedback from anon, authenticated;

-- ------------------------------------------------------------ attribution --
create view public.feedback_attributed
with (security_invoker = true) as
select
  f.id,
  f.activity_event_id,
  f.user_id,
  f.rating,
  f.got_what_needed,
  f.comment,
  f.status,
  f.resolution_note,
  f.resolved_by,
  f.resolved_at,
  f.hidden_at,
  f.hidden_by,
  f.created_at,
  f.updated_at,
  f.client_conversation_id,
  f.client_message_id,
  e.occurred_at,
  e.feature,
  e.category,
  e.surface,
  e.turn_kind,
  e.succeeded,
  e.latency_ms,
  coalesce(e.actor_role, l.role)         as role,
  coalesce(e.location_id, l.location_id) as location_id,
  l.display_name
from public.assistant_feedback f
join public.activity_events e on e.id = f.activity_event_id
left join public.leader_directory l on l.user_id = f.user_id;

revoke all on public.feedback_attributed from anon, authenticated;

-- Whether one row counts toward the rating figures: open and not hidden. The
-- single definition the summary and the per-surface averages share.
create function public.feedback_counts_toward_ratings(
  p_status    public.feedback_status,
  p_hidden_at timestamptz
)
returns boolean
language sql
immutable
set search_path = public, extensions
as $$
  select p_hidden_at is null and p_status in ('pending', 'in_review');
$$;

create function public.analytics_feedback_summary(
  p_from      timestamptz,
  p_to        timestamptz,
  p_locations text[] default null,
  p_role      public.app_user_role default null,
  p_actor     uuid   default null,
  p_surface   public.activity_surface default null
)
returns table (
  responses         bigint,
  average_rating    numeric,
  rating_1          bigint,
  rating_2          bigint,
  rating_3          bigint,
  rating_4          bigint,
  rating_5          bigint,
  outcome_yes       bigint,
  outcome_partially bigint,
  outcome_no        bigint,
  pending           bigint,
  in_review         bigint,
  resolved          bigint,
  dismissed         bigint,
  hidden            bigint
)
language sql
stable
set search_path = public, extensions
as $$
  select
    count(*) filter (where c.open),
    round(avg(c.rating) filter (where c.open), 1),
    count(*) filter (where c.open and c.rating = 1),
    count(*) filter (where c.open and c.rating = 2),
    count(*) filter (where c.open and c.rating = 3),
    count(*) filter (where c.open and c.rating = 4),
    count(*) filter (where c.open and c.rating = 5),
    count(*) filter (where c.open and c.got_what_needed = 'yes'),
    count(*) filter (where c.open and c.got_what_needed = 'partially'),
    count(*) filter (where c.open and c.got_what_needed = 'no'),
    count(*) filter (where c.status = 'pending'),
    count(*) filter (where c.status = 'in_review'),
    count(*) filter (where c.status = 'resolved'),
    count(*) filter (where c.status = 'dismissed'),
    count(*) filter (where c.hidden_at is not null)
  from (
    select f.*, public.feedback_counts_toward_ratings(f.status, f.hidden_at) as open
    from public.feedback_attributed f
    where f.created_at >= p_from
      and f.created_at <  p_to
      and (p_locations is null or f.location_id = any (p_locations))
      and (p_role    is null or f.role    = p_role)
      and (p_actor   is null or f.user_id = p_actor)
      and (p_surface is null or f.surface = p_surface)
  ) c;
$$;

comment on function public.analytics_feedback_summary is
  'Rating figures count OPEN, unhidden feedback only; queue depths and the hidden count include every row. average_rating is null when nothing qualifies.';

create function public.analytics_feedback_list(
  p_from      timestamptz,
  p_to        timestamptz,
  p_locations text[] default null,
  p_role      public.app_user_role default null,
  p_actor     uuid   default null,
  p_surface   public.activity_surface default null,
  p_statuses  public.feedback_status[] default null,
  p_outcome   public.feedback_outcome default null,
  p_rating    smallint default null,
  p_include_hidden boolean default false,
  p_search    text    default null,
  p_limit     integer default 25,
  p_offset    integer default 0
)
returns table (
  id uuid,
  activity_event_id uuid,
  rating smallint,
  got_what_needed public.feedback_outcome,
  comment text,
  status public.feedback_status,
  resolution_note text,
  resolved_at timestamptz,
  resolved_by_name text,
  hidden_at timestamptz,
  hidden_by_name text,
  created_at timestamptz,
  updated_at timestamptz,
  occurred_at timestamptz,
  surface public.activity_surface,
  category public.activity_category,
  feature public.activity_feature,
  succeeded boolean,
  role public.app_user_role,
  display_name text,
  location_id text,
  client_conversation_id text,
  client_message_id text,
  total_count bigint
)
language sql
stable
set search_path = public, extensions
as $$
  with filtered as (
    select f.*
    from public.feedback_attributed f
    where f.created_at >= p_from
      and f.created_at <  p_to
      and (p_include_hidden or f.hidden_at is null)
      and (p_locations is null or f.location_id = any (p_locations))
      and (p_role    is null or f.role    = p_role)
      and (p_actor   is null or f.user_id = p_actor)
      and (p_surface is null or f.surface = p_surface)
      -- An EMPTY status list means "no filter": an empty queue that looks
      -- identical to a finished one is the worse failure.
      and (p_statuses is null or cardinality(p_statuses) = 0 or f.status = any (p_statuses))
      and (p_outcome is null or f.got_what_needed = p_outcome)
      and (p_rating  is null or f.rating          = p_rating)
      and (
        p_search is null
        or btrim(p_search) = ''
        or f.comment ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      )
  )
  select
    f.id,
    f.activity_event_id,
    f.rating,
    f.got_what_needed,
    f.comment,
    f.status,
    f.resolution_note,
    f.resolved_at,
    rb.display_name,
    f.hidden_at,
    hb.display_name,
    f.created_at,
    f.updated_at,
    f.occurred_at,
    f.surface,
    f.category,
    f.feature,
    f.succeeded,
    f.role,
    f.display_name,
    f.location_id,
    f.client_conversation_id,
    f.client_message_id,
    (select count(*) from filtered)
  from filtered f
  left join public.leader_directory rb on rb.user_id = f.resolved_by
  left join public.leader_directory hb on hb.user_id = f.hidden_by
  order by f.created_at desc, f.id
  limit  greatest(1, least(coalesce(p_limit, 25), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create function public.analytics_feedback_detail(p_id uuid)
returns table (
  id uuid,
  activity_event_id uuid,
  rating smallint,
  got_what_needed public.feedback_outcome,
  comment text,
  status public.feedback_status,
  resolution_note text,
  resolved_at timestamptz,
  resolved_by_name text,
  hidden_at timestamptz,
  hidden_by_name text,
  created_at timestamptz,
  updated_at timestamptz,
  occurred_at timestamptz,
  surface public.activity_surface,
  category public.activity_category,
  feature public.activity_feature,
  turn_kind public.activity_turn_kind,
  succeeded boolean,
  latency_ms integer,
  role public.app_user_role,
  display_name text,
  location_id text,
  client_conversation_id text,
  client_message_id text
)
language sql
stable
set search_path = public, extensions
as $$
  select
    f.id, f.activity_event_id, f.rating, f.got_what_needed, f.comment, f.status,
    f.resolution_note, f.resolved_at, rb.display_name, f.hidden_at, hb.display_name,
    f.created_at, f.updated_at, f.occurred_at, f.surface, f.category, f.feature,
    f.turn_kind, f.succeeded, f.latency_ms, f.role, f.display_name, f.location_id,
    f.client_conversation_id, f.client_message_id
  from public.feedback_attributed f
  left join public.leader_directory rb on rb.user_id = f.resolved_by
  left join public.leader_directory hb on hb.user_id = f.hidden_by
  where f.id = p_id;
$$;

create function public.analytics_surfaces(
  p_from      timestamptz,
  p_to        timestamptz,
  p_locations text[] default null,
  p_role      public.app_user_role default null,
  p_actor     uuid   default null
)
returns table (
  surface public.activity_surface,
  events bigint,
  active_users bigint,
  rated bigint,
  average_rating numeric
)
language sql
stable
set search_path = public, extensions
as $$
  select
    a.surface,
    count(*),
    count(distinct a.actor_user_id),
    count(f.id) filter (where public.feedback_counts_toward_ratings(f.status, f.hidden_at)),
    round(avg(f.rating) filter (where public.feedback_counts_toward_ratings(f.status, f.hidden_at)), 1)
  from public.activity_attributed a
  left join public.assistant_feedback f on f.activity_event_id = a.event_id
  where a.occurred_at >= p_from
    and a.occurred_at <  p_to
    and a.surface is not null
    and (p_locations is null or a.location_id = any (p_locations))
    and (p_role  is null or a.role          = p_role)
    and (p_actor is null or a.actor_user_id = p_actor)
  group by a.surface
  order by 2 desc;
$$;

create function public.analytics_when(
  p_from      timestamptz,
  p_to        timestamptz,
  p_timezone  text   default 'America/Chicago',
  p_locations text[] default null,
  p_role      public.app_user_role default null,
  p_actor     uuid   default null
)
returns table (day_of_week integer, hour_of_day integer, events bigint)
language sql
stable
set search_path = public, extensions
as $$
  -- An unknown zone falls back rather than raising, so a misconfigured
  -- variable cannot take the page down.
  with zone as (
    select case
      when exists (select 1 from pg_timezone_names where name = p_timezone) then p_timezone
      else 'America/Chicago'
    end as tz
  ),
  local as (
    select a.occurred_at at time zone (select tz from zone) as local_at
    from public.activity_attributed a
    where a.occurred_at >= p_from
      and a.occurred_at <  p_to
      and (p_locations is null or a.location_id = any (p_locations))
      and (p_role  is null or a.role          = p_role)
      and (p_actor is null or a.actor_user_id = p_actor)
  )
  select extract(dow from local_at)::integer, extract(hour from local_at)::integer, count(*)
  from local
  group by 1, 2
  order by 1, 2;
$$;

create function public.analytics_topics(
  p_from      timestamptz,
  p_to        timestamptz,
  p_locations text[] default null,
  p_role      public.app_user_role default null,
  p_actor     uuid   default null
)
returns table (
  category public.activity_category,
  events bigint,
  active_users bigint,
  acknowledgements bigint,
  last_asked timestamptz
)
language sql
stable
set search_path = public, extensions
as $$
  select
    a.category,
    count(*) filter (where a.turn_kind is distinct from 'acknowledgement'),
    count(distinct a.actor_user_id) filter (where a.turn_kind is distinct from 'acknowledgement'),
    count(*) filter (where a.turn_kind = 'acknowledgement'),
    max(a.occurred_at) filter (where a.turn_kind is distinct from 'acknowledgement')
  from public.activity_attributed a
  where a.occurred_at >= p_from
    and a.occurred_at <  p_to
    and (p_locations is null or a.location_id = any (p_locations))
    and (p_role  is null or a.role          = p_role)
    and (p_actor is null or a.actor_user_id = p_actor)
  group by a.category
  having count(*) filter (where a.turn_kind is distinct from 'acknowledgement') > 0
  order by 2 desc;
$$;

create function public.analytics_extraction_runs(p_from timestamptz, p_to timestamptz)
returns table (
  parser_key text,
  runs bigint,
  succeeded bigint,
  failed bigint,
  with_warnings bigint,
  facts bigint,
  locations bigint,
  last_run timestamptz
)
language sql
stable
set search_path = public, extensions
as $$
  select
    r.parser_key,
    count(*),
    count(*) filter (where r.status = 'succeeded'),
    count(*) filter (where r.status = 'failed'),
    count(*) filter (where cardinality(r.warnings) > 0),
    coalesce(sum(r.fact_count), 0),
    coalesce(sum(r.location_count), 0),
    max(r.created_at)
  from public.report_ingestions r
  where r.created_at >= p_from
    and r.created_at <  p_to
  group by r.parser_key
  order by 2 desc, r.parser_key;
$$;

revoke all on function public.feedback_counts_toward_ratings(public.feedback_status, timestamptz) from public, anon, authenticated;
revoke all on function public.analytics_feedback_summary(timestamptz, timestamptz, text[], public.app_user_role, uuid, public.activity_surface) from public, anon, authenticated;
revoke all on function public.analytics_feedback_list(timestamptz, timestamptz, text[], public.app_user_role, uuid, public.activity_surface, public.feedback_status[], public.feedback_outcome, smallint, boolean, text, integer, integer) from public, anon, authenticated;
revoke all on function public.analytics_feedback_detail(uuid) from public, anon, authenticated;
revoke all on function public.analytics_surfaces(timestamptz, timestamptz, text[], public.app_user_role, uuid) from public, anon, authenticated;
revoke all on function public.analytics_when(timestamptz, timestamptz, text, text[], public.app_user_role, uuid) from public, anon, authenticated;
revoke all on function public.analytics_topics(timestamptz, timestamptz, text[], public.app_user_role, uuid) from public, anon, authenticated;
revoke all on function public.analytics_extraction_runs(timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.feedback_counts_toward_ratings(public.feedback_status, timestamptz) to service_role;
grant execute on function public.analytics_feedback_summary(timestamptz, timestamptz, text[], public.app_user_role, uuid, public.activity_surface) to service_role;
grant execute on function public.analytics_feedback_list(timestamptz, timestamptz, text[], public.app_user_role, uuid, public.activity_surface, public.feedback_status[], public.feedback_outcome, smallint, boolean, text, integer, integer) to service_role;
grant execute on function public.analytics_feedback_detail(uuid) to service_role;
grant execute on function public.analytics_surfaces(timestamptz, timestamptz, text[], public.app_user_role, uuid) to service_role;
grant execute on function public.analytics_when(timestamptz, timestamptz, text, text[], public.app_user_role, uuid) to service_role;
grant execute on function public.analytics_topics(timestamptz, timestamptz, text[], public.app_user_role, uuid) to service_role;
grant execute on function public.analytics_extraction_runs(timestamptz, timestamptz) to service_role;
