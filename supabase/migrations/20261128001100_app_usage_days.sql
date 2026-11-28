-- ADMIN ANALYTICS: L10 MEETINGS, THE FORMS REGISTER, AI TRAINING, GOOGLE REVIEWS AND CALENDAR
--
-- Port from Ask Sunny (Pau, 28 Nov 2026: "add usage for the L10 all meetings and the form monitoring as well pls ...
-- and backfill it", "also add ai training", "add google reviews too and calendar").
--
-- Two kinds of record, and the view counts both:
--
--   1. WHAT ALREADY LEAVES A ROW, counted where it lives (so its history is there from the start):
--        Forms Register   archive / unarchive and every follow-up action (form_instance_events); a download is not
--                         counted, because the same PDF route serves the chat's form card
--        AI Training      a submitted assignment (ai_training_submissions)
--        Calendar         a reminder saved (calendar_reminders)
--
--   2. OPENING THE PAGE, which left no trace until now: one row per person, area (and L10 meeting) and Central day in
--      `app_usage_days`, so a page refreshed forty times is one day of use, not forty events. Written by the pages
--      (src/lib/analytics/app-usage.ts) through `record_app_usage`. L10 rows are also backfilled once from the
--      Leadership Hub's save history (source 'backfill'), matched to accounts by email; see
--      docs/analytics-app-areas.md. Google Reviews and Calendar visits start from this release: nothing recorded them.
--
-- The view is restated exactly as production holds it (pg_get_viewdef, 28 Nov 2026) with four more branches. Same
-- columns, same order, same security_invoker. The feature key for the Forms Register is `form_monitoring`, as in Ask
-- Sunny (the route is /forms/monitoring); its label is "Forms Register".
--
-- Not applied by the pull request: applied after merge, after 20261128001000.

create table if not exists public.app_usage_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  area public.activity_feature not null
    check (area in ('l10', 'form_monitoring', 'ai_training', 'google_reviews', 'calendar')),
  -- The L10 meeting key ('bcs-dm', 'bcs-gm'); '' for the other areas.
  detail text not null default '' check (length(detail) <= 80),
  -- The Central calendar day, like every other day on this dashboard.
  day date not null,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  hits integer not null default 1 check (hits > 0),
  -- The role at the time, like activity_events.actor_role.
  actor_role public.app_user_role,
  source text not null default 'app' check (source in ('app', 'backfill')),
  primary key (user_id, area, detail, day)
);

create index if not exists app_usage_days_first_at_idx on public.app_usage_days (first_at);

comment on table public.app_usage_days is
  'One row per person, app area (and L10 meeting) and Central day the person opened that area. Counted by activity_unified as one event per row.';

alter table public.app_usage_days enable row level security;
revoke all on public.app_usage_days from anon, authenticated;

create or replace function public.record_app_usage(
  p_user   uuid,
  p_role   public.app_user_role,
  p_area   public.activity_feature,
  p_detail text default ''
)
returns void
language sql
security invoker
set search_path = public, extensions
as $$
  insert into public.app_usage_days (user_id, area, detail, day, actor_role)
  values (p_user, p_area, coalesce(p_detail, ''), (now() at time zone 'America/Chicago')::date, p_role)
  on conflict (user_id, area, detail, day)
  do update set last_at = now(), hits = public.app_usage_days.hits + 1;
$$;

revoke all on function public.record_app_usage(uuid, public.app_user_role, public.activity_feature, text)
  from public, anon, authenticated;

create or replace view public.activity_unified
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

  -- Filed forms. `created_by` is text, cast only when it is a uuid. A form still with HR is not counted yet.
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
  where i.hr_approval_state is null or i.hr_approval_state = 'approved'

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
  from public.report_ingestions r

  union all

  -- A day somebody opened L10, the Forms Register, AI Training, Google Reviews or Calendar. The location is the
  -- person's own (activity_attributed's fallback): opening a page is not about any one store.
  select
    null::uuid,
    u.first_at,
    u.user_id,
    u.actor_role,
    u.area,
    case u.area
      when 'l10'::public.activity_feature then 'l10_meeting'::text
      when 'form_monitoring'::public.activity_feature then 'form_monitoring'::text
      when 'ai_training'::public.activity_feature then 'ai_training'::text
      when 'google_reviews'::public.activity_feature then 'google_reviews'::text
      else 'calendar'::text
    end::public.activity_category,
    null::text,
    true,
    null::public.activity_surface,
    'not_applicable'::public.activity_turn_kind
  from public.app_usage_days u

  union all

  -- Forms Register actions: archive, unarchive and the follow-ups. Not for a form still with HR (as above), and the
  -- location is the person's own: an administrator following up a store's form is not that store using the app.
  select
    null::uuid,
    ev.created_at,
    case when ev.actor ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then ev.actor::uuid end,
    null::public.app_user_role,
    'form_monitoring'::public.activity_feature,
    'form_monitoring'::public.activity_category,
    null::text,
    true,
    null::public.activity_surface,
    'not_applicable'::public.activity_turn_kind
  from public.form_instance_events ev
    join public.form_instances fi on fi.id = ev.instance_id
  where ev.kind::text = any (array[
      'archived', 'unarchived', 'follow_up_started', 'follow_up_date_changed', 'follow_up_owner_changed',
      'followed_up', 'follow_up_reopened'
    ])
    and (fi.hr_approval_state is null or fi.hr_approval_state = 'approved')

  union all

  -- AI Training: a submitted assignment.
  select
    null::uuid,
    ts.created_at,
    case when ts.user_subject ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then ts.user_subject::uuid end,
    null::public.app_user_role,
    'ai_training'::public.activity_feature,
    'ai_training'::public.activity_category,
    null::text,
    true,
    null::public.activity_surface,
    'not_applicable'::public.activity_turn_kind
  from public.ai_training_submissions ts

  union all

  -- Calendar: a reminder saved (still counted if it was later deleted: it was used).
  select
    null::uuid,
    cr.created_at,
    case when cr.owner_subject ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then cr.owner_subject::uuid end,
    null::public.app_user_role,
    'calendar'::public.activity_feature,
    'calendar'::public.activity_category,
    null::text,
    true,
    null::public.activity_surface,
    'not_applicable'::public.activity_turn_kind
  from public.calendar_reminders cr;

comment on view public.activity_unified is
  'Every recorded act in one shape: activity_events plus form_instances (not while with HR), knowledge_documents, report_ingestions, app_usage_days (days an area was opened), Forms Register actions, AI Training submissions and Calendar reminders, read where they live.';

-- Restated: deny by default on top of a security_invoker view.
revoke all on public.activity_unified from anon, authenticated;

-- ------------------------------------------- usage by person, by area -----
--
-- "list all users per name ... not just by title": the per-person table needs each person's count in every area.
-- Filtered exactly as analytics_leaders filters a person's events (locations on the event; role and person on the
-- roster, which the page joins), so a person's areas add up to their Activity figure.

create or replace function public.analytics_people_features(
  p_from      timestamptz,
  p_to        timestamptz,
  p_locations text[] default null,
  p_role      public.app_user_role default null,
  p_actor     uuid   default null
)
returns table (user_id uuid, feature text, events bigint)
language sql
stable
set search_path = public, extensions
as $$
  select
    a.actor_user_id as user_id,
    a.feature::text as feature,
    count(*) as events
  from public.activity_attributed a
  where a.occurred_at >= p_from
    and a.occurred_at <  p_to
    and a.actor_user_id is not null
    and (p_locations is null or a.location_id = any (p_locations))
    and (p_actor is null or a.actor_user_id = p_actor)
  group by 1, 2;
$$;

revoke all on function public.analytics_people_features(timestamptz, timestamptz, text[], public.app_user_role, uuid)
  from anon, authenticated;
