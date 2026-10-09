-- ============================================================================
-- ANALYTICS DAYS ARE BUSINESS DAYS (US CENTRAL), NOT UTC DAYS
-- ============================================================================
--
-- Two functions decided "which day" or "which hour" without the business zone:
--
-- 1. `analytics_trend` bucketed with `date_trunc(bucket, occurred_at)`. On a
--    `timestamptz` that truncates in the SESSION time zone, which on Supabase
--    is UTC, so a "day" on the trend chart ran from 7pm to 7pm Central in
--    summer (6pm to 6pm in winter): an answer at 9pm on the 9th was counted on
--    the 10th. It now takes the zone from the application, like
--    `analytics_when` already did, and truncates the LOCAL time.
--
-- 2. `analytics_when` fell back to America/New_York when the zone it was given
--    was unknown, and defaulted to it when none was given. The application
--    always passes its zone, so neither path was reached, but a fallback that
--    disagrees with the product's one business zone is a second answer to
--    "what time is it", waiting for the day it is reached. Both now say
--    America/Chicago, the zone `src/lib/business-date.ts` defaults to.
--
-- The window bounds (`p_from`, `p_to`) were the other half of the defect and
-- are fixed in the application (`resolveWindow`): they are now business-zone
-- midnights, so these functions' `>= p_from and < p_to` select business days.
--
-- SHAPE. `analytics_trend` gains a trailing `p_timezone` with a default, so a
-- caller that does not pass it (the application before this release) still
-- works and gets Central. The old signature is dropped rather than overloaded:
-- two overloads differing by one defaulted argument are ambiguous to
-- PostgREST. `analytics_when` keeps its signature.
--
-- PRIVILEGES ARE RESTATED. A dropped function loses its grants, so the
-- recreated ones are revoked from public, anon and authenticated and granted
-- to service_role exactly as in the migrations that created them.
--
-- ORDER OF RELEASE: apply this migration BEFORE deploying the application
-- change that passes `p_timezone` to `analytics_trend`. The old application
-- keeps working against the new function (the argument is defaulted); the new
-- application against the old function would get "function not found".
-- ============================================================================

drop function if exists public.analytics_trend(timestamptz, timestamptz, text, text[], public.app_user_role, uuid);

create function public.analytics_trend(
  p_from      timestamptz,
  p_to        timestamptz,
  p_bucket    text   default 'day',
  p_locations text[] default null,
  p_role      public.app_user_role default null,
  p_actor     uuid   default null,
  p_timezone  text   default 'America/Chicago'
)
returns table (bucket_start date, events bigint, active_users bigint)
language sql
stable
set search_path = public, extensions
as $$
  -- An unknown zone falls back rather than raising, so a misconfigured
  -- variable cannot take the page down. The bucket is whitelisted, never
  -- interpolated.
  with zone as (
    select case
      when exists (select 1 from pg_timezone_names where name = p_timezone) then p_timezone
      else 'America/Chicago'
    end as tz
  )
  select
    date_trunc(
      case when p_bucket in ('day', 'week', 'month') then p_bucket else 'day' end,
      a.occurred_at at time zone (select tz from zone)
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

drop function if exists public.analytics_when(timestamptz, timestamptz, text, text[], public.app_user_role, uuid);

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

revoke all on function public.analytics_trend(timestamptz, timestamptz, text, text[], public.app_user_role, uuid, text) from public, anon, authenticated;
revoke all on function public.analytics_when(timestamptz, timestamptz, text, text[], public.app_user_role, uuid)        from public, anon, authenticated;

grant execute on function public.analytics_trend(timestamptz, timestamptz, text, text[], public.app_user_role, uuid, text) to service_role;
grant execute on function public.analytics_when(timestamptz, timestamptz, text, text[], public.app_user_role, uuid)        to service_role;
