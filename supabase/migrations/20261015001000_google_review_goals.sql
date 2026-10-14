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
 * A BASELINE, ONCE SET, CANNOT BE CHANGED OR CLEARED BY ANY WRITER. Moving it would change what has
 * counted, so the only way to a different baseline is a deliberate, reviewed migration that drops this trigger.
 */
create or replace function public.google_review_goals_guard_baseline()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.baseline_review_id is not null
     and (new.baseline_review_id is distinct from old.baseline_review_id
          or new.baseline_review_time is distinct from old.baseline_review_time) then
    raise exception 'google_review_goals: store % already has a baseline; it cannot be overwritten', old.store_code
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists google_review_goals_guard_baseline on public.google_review_goals;
create trigger google_review_goals_guard_baseline
  before update on public.google_review_goals
  for each row execute function public.google_review_goals_guard_baseline();

/*
 * SET BASELINES from an EXPLICIT, REVIEWED LIST. Nothing is chosen at execution time.
 *
 *   p_baselines  jsonb array of {store_code, review_id, review_time} — exactly what was approved.
 *
 * Every entry is verified first, and the whole call is one transaction (any failure changes nothing):
 *   - the store has a goal row that has NO baseline yet (an existing baseline is never overwritten);
 *   - the review is live and belongs to THAT store's own Google location;
 *   - its creation time equals the approved review_time exactly.
 * A store may appear once. Returns the rows written.
 */
create or replace function public.google_review_set_baselines(p_actor text, p_baselines jsonb)
returns table (store_code text, baseline_review_id text, baseline_review_time timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_store text;
  v_rid text;
  v_time timestamptz;
  v_seen text[] := '{}';
  v_goal public.google_review_goals%rowtype;
  v_actual timestamptz;
begin
  if p_actor is null or length(btrim(p_actor)) = 0 then
    raise exception 'google_review_set_baselines: an actor is required' using errcode = 'invalid_parameter_value';
  end if;
  if p_baselines is null or jsonb_typeof(p_baselines) <> 'array' or jsonb_array_length(p_baselines) = 0 then
    raise exception 'google_review_set_baselines: baselines must be a non-empty array' using errcode = 'invalid_parameter_value';
  end if;

  for v_item in select * from jsonb_array_elements(p_baselines) loop
    v_store := v_item ->> 'store_code';
    v_rid := v_item ->> 'review_id';
    v_time := (v_item ->> 'review_time')::timestamptz;
    if v_store is null or v_rid is null or v_time is null then
      raise exception 'google_review_set_baselines: each entry needs store_code, review_id and review_time' using errcode = 'invalid_parameter_value';
    end if;
    if v_store = any (v_seen) then
      raise exception 'google_review_set_baselines: store % appears twice', v_store using errcode = 'invalid_parameter_value';
    end if;
    v_seen := v_seen || v_store;

    select * into v_goal from public.google_review_goals g where g.store_code = v_store for update;
    if not found then
      raise exception 'google_review_set_baselines: unknown store %', v_store using errcode = 'invalid_parameter_value';
    end if;
    if v_goal.baseline_review_id is not null then
      raise exception 'google_review_set_baselines: store % already has a baseline and it is not overwritten', v_store using errcode = 'check_violation';
    end if;

    select r.review_create_time into v_actual
      from public.google_reviews r
      join public.google_review_locations l on l.id = r.location_id
     where l.store_code = v_store and r.google_review_id = v_rid and r.removed_at is null;
    if not found then
      raise exception 'google_review_set_baselines: review % is not a live review of store %', v_rid, v_store using errcode = 'check_violation';
    end if;
    if v_actual <> v_time then
      raise exception 'google_review_set_baselines: review % has creation time %, not the approved %', v_rid, v_actual, v_time using errcode = 'check_violation';
    end if;

    update public.google_review_goals g
       set baseline_review_id = v_rid, baseline_review_time = v_actual,
           baseline_set_at = now(), baseline_set_by = left(p_actor, 200)
     where g.store_code = v_store;
    store_code := v_store; baseline_review_id := v_rid; baseline_review_time := v_actual;
    return next;
  end loop;
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

revoke all on function public.google_review_set_baselines(text, jsonb) from public, anon, authenticated;
grant execute on function public.google_review_set_baselines(text, jsonb) to service_role;
revoke all on function public.google_review_goals_guard_baseline() from public, anon, authenticated;
revoke all on function public.google_review_goal_counts(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.google_review_goal_counts(timestamptz, timestamptz, timestamptz, timestamptz) to service_role;

comment on table public.google_review_goals is
  'Per-salon monthly review target and baseline review. Reviews at or before the baseline are historical and never count toward goals.';
