-- GOOGLE REVIEWS — MONTHLY GOALS AND BASELINES (the Ask Sunny rules, per Buff City Soap salon).
--
-- A review COUNTS toward a salon's goal only when it is live, rated 3–5 stars, and was created
-- strictly AFTER the salon's baseline review (and is not the baseline itself). Reviews at or before
-- the baseline, and every review of a salon with no baseline, are historical: stored and searchable,
-- never counted. Creation time is Google's original review time, never the import time.
-- Additive only: no existing table, view or function is changed.

create table if not exists public.google_review_goals (
  store_code text primary key references public.google_review_locations (store_code) on delete cascade,
  monthly_target integer not null default 10 check (monthly_target between 1 and 1000),
  baseline_review_id text check (baseline_review_id is null or length(baseline_review_id) between 1 and 200),
  baseline_review_time timestamptz,
  baseline_set_at timestamptz,
  baseline_set_by text check (baseline_set_by is null or length(baseline_set_by) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_review_goals_baseline_pair check ((baseline_review_id is null) = (baseline_review_time is null))
);

drop trigger if exists google_review_goals_touch on public.google_review_goals;
create trigger google_review_goals_touch
  before update on public.google_review_goals
  for each row execute function public.touch_updated_at();

/* Monthly goal of 10 for each approved salon. No baseline yet: a salon with none is "not counting". */
insert into public.google_review_goals (store_code)
select l.store_code from public.google_review_locations l
on conflict (store_code) do nothing;

alter table public.google_review_goals enable row level security;
alter table public.google_review_goals force row level security;
revoke all on public.google_review_goals from anon, authenticated;

/*
 * SET BASELINES from the newest live imported review of each salon that has none.
 * Idempotent and never moves an existing baseline. Returns one row per salon touched.
 */
create or replace function public.google_review_set_baselines(p_actor text)
returns table (store_code text, baseline_review_id text, baseline_review_time timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with newest as (
    select distinct on (l.store_code) l.store_code as sc, r.google_review_id as rid, r.review_create_time as rt
      from public.google_review_locations l
      join public.google_reviews r on r.location_id = l.id and r.removed_at is null
     order by l.store_code, r.review_create_time desc, r.google_review_id desc
  )
  update public.google_review_goals g
     set baseline_review_id = n.rid, baseline_review_time = n.rt,
         baseline_set_at = now(), baseline_set_by = left(p_actor, 200)
    from newest n
   where g.store_code = n.sc and g.baseline_review_id is null
  returning g.store_code, g.baseline_review_id, g.baseline_review_time;
end;
$$;

/*
 * GOAL COUNTS PER SALON. Windows are supplied by the caller (Central-time boundaries):
 *   week       [p_week_start, p_now]        last week [p_prev_week_start, p_week_start)
 *   month      [p_month_start, p_now]
 * historical = live reviews at or before the baseline (all of them when there is no baseline).
 */
create or replace function public.google_review_goal_counts(
  p_prev_week_start timestamptz, p_week_start timestamptz, p_month_start timestamptz, p_now timestamptz
) returns table (
  store_code text, display_name text, monthly_target integer,
  baseline_review_id text, baseline_review_time timestamptz,
  week_count bigint, last_week_count bigint, month_count bigint, historical_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.store_code, l.display_name, g.monthly_target, g.baseline_review_id, g.baseline_review_time,
    count(r.id) filter (where q.ok and r.review_create_time >= p_week_start and r.review_create_time <= p_now),
    count(r.id) filter (where q.ok and r.review_create_time >= p_prev_week_start and r.review_create_time < p_week_start),
    count(r.id) filter (where q.ok and r.review_create_time >= p_month_start and r.review_create_time <= p_now),
    count(r.id) filter (where r.id is not null and r.removed_at is null and not coalesce(q.after_baseline, false))
  from public.google_review_goals g
  join public.google_review_locations l on l.store_code = g.store_code
  left join public.google_reviews r on r.location_id = l.id and r.removed_at is null
  left join lateral (
    select (g.baseline_review_time is not null
            and r.review_create_time > g.baseline_review_time
            and r.google_review_id <> g.baseline_review_id) as after_baseline,
           (g.baseline_review_time is not null
            and r.review_create_time > g.baseline_review_time
            and r.google_review_id <> g.baseline_review_id
            and r.star_rating >= 3) as ok
  ) q on true
  group by l.store_code, l.display_name, g.monthly_target, g.baseline_review_id, g.baseline_review_time
  order by l.store_code;
$$;

revoke all on function public.google_review_set_baselines(text) from public, anon, authenticated;
grant execute on function public.google_review_set_baselines(text) to service_role;
revoke all on function public.google_review_goal_counts(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.google_review_goal_counts(timestamptz, timestamptz, timestamptz, timestamptz) to service_role;

comment on table public.google_review_goals is
  'Per-salon monthly review target and baseline review. Reviews at or before the baseline are historical and never count toward goals.';
