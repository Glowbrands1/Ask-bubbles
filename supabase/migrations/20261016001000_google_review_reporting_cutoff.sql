-- GOOGLE REVIEWS — REPORTING CUTOFF, v2 GOAL COUNTS, WEEKLY/MONTHLY PERIODS.
-- Additive only. The immutable baseline columns, their guard trigger and the v1 counting function are untouched.
--
-- A salon's goal counting can start from a REPORTING CUTOFF (`count_from`, an instant) instead of its baseline
-- review. With a cutoff, a live 3–5★ review counts when it was created AT OR AFTER the cutoff (the baseline review
-- gets no special treatment); without one the original baseline rule applies. The cutoff is set once, through an
-- audited function, and is itself immutable.

alter table public.google_review_goals
  add column if not exists count_from timestamptz,
  add column if not exists count_from_set_at timestamptz,
  add column if not exists count_from_set_by text check (count_from_set_by is null or length(count_from_set_by) <= 200),
  add column if not exists count_from_previous_baseline_id text,
  add column if not exists count_from_previous_baseline_time timestamptz;

create or replace function public.google_review_goals_guard_count_from()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.count_from is not null and new.count_from is distinct from old.count_from then
    raise exception 'google_review_goals: store % already has a reporting cutoff; it cannot be overwritten', old.store_code
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

/* Re-runnable: the project this was first applied to already has the trigger, so tooling that applies it again must not fail here. */
drop trigger if exists google_review_goals_guard_count_from on public.google_review_goals;
create trigger google_review_goals_guard_count_from
  before update on public.google_review_goals
  for each row execute function public.google_review_goals_guard_count_from();

/*
 * SET THE REPORTING CUTOFF for named stores, in one transaction, never overwriting one:
 *   - p_stores must be a non-empty list of stores that have a goal row with NO cutoff yet;
 *   - the cutoff must not be in the future, and must be at or before the store's baseline review time
 *     (it can only widen what counts, never silently narrow it);
 *   - the baseline it supersedes is copied into count_from_previous_baseline_* for the record;
 *     the baseline columns themselves are not touched.
 */
create or replace function public.google_review_set_reporting_cutoff(p_actor text, p_cutoff timestamptz, p_stores text[])
returns table (store_code text, count_from timestamptz, previous_baseline_id text, previous_baseline_time timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store text;
  v_goal public.google_review_goals%rowtype;
begin
  if p_actor is null or length(btrim(p_actor)) = 0 then
    raise exception 'google_review_set_reporting_cutoff: an actor is required' using errcode = 'invalid_parameter_value';
  end if;
  if p_cutoff is null or p_cutoff > now() then
    raise exception 'google_review_set_reporting_cutoff: the cutoff must be set and not in the future' using errcode = 'invalid_parameter_value';
  end if;
  if p_stores is null or cardinality(p_stores) = 0 then
    raise exception 'google_review_set_reporting_cutoff: name the stores' using errcode = 'invalid_parameter_value';
  end if;
  if (select count(distinct s) from unnest(p_stores) s) <> cardinality(p_stores) then
    raise exception 'google_review_set_reporting_cutoff: a store appears twice' using errcode = 'invalid_parameter_value';
  end if;

  foreach v_store in array p_stores loop
    select * into v_goal from public.google_review_goals g where g.store_code = v_store for update;
    if not found then
      raise exception 'google_review_set_reporting_cutoff: unknown store %', v_store using errcode = 'invalid_parameter_value';
    end if;
    if v_goal.count_from is not null then
      raise exception 'google_review_set_reporting_cutoff: store % already has a cutoff and it is not overwritten', v_store using errcode = 'check_violation';
    end if;
    if v_goal.baseline_review_time is not null and p_cutoff > v_goal.baseline_review_time then
      raise exception 'google_review_set_reporting_cutoff: the cutoff must not be later than store %''s baseline', v_store using errcode = 'check_violation';
    end if;

    update public.google_review_goals g
       set count_from = p_cutoff, count_from_set_at = now(), count_from_set_by = left(p_actor, 200),
           count_from_previous_baseline_id = v_goal.baseline_review_id,
           count_from_previous_baseline_time = v_goal.baseline_review_time
     where g.store_code = v_store;
    store_code := v_store; count_from := p_cutoff;
    previous_baseline_id := v_goal.baseline_review_id; previous_baseline_time := v_goal.baseline_review_time;
    return next;
  end loop;
end;
$$;

/*
 * GOAL COUNTS v2: as v1 plus the reporting cutoff. Windows are supplied by the caller (Central boundaries):
 *   week [p_week_start, p_now]   last week [p_prev_week_start, p_week_start)   month [p_month_start, p_now]
 * historical = live reviews before the cutoff (or at/before the baseline when there is no cutoff).
 */
create or replace function public.google_review_goal_counts_v2(
  p_prev_week_start timestamptz, p_week_start timestamptz, p_month_start timestamptz, p_now timestamptz
) returns table (
  store_code text, display_name text, monthly_target integer,
  baseline_review_id text, baseline_review_time timestamptz, count_from timestamptz,
  week_count bigint, last_week_count bigint, month_count bigint, historical_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.store_code, l.display_name, g.monthly_target, g.baseline_review_id, g.baseline_review_time, g.count_from,
    count(r.id) filter (where q.after and q.rated and r.review_create_time >= p_week_start and r.review_create_time <= p_now),
    count(r.id) filter (where q.after and q.rated and r.review_create_time >= p_prev_week_start and r.review_create_time < p_week_start),
    count(r.id) filter (where q.after and q.rated and r.review_create_time >= p_month_start and r.review_create_time <= p_now),
    count(r.id) filter (where r.id is not null and not coalesce(q.after, false))
  from public.google_review_goals g
  join public.google_review_locations l on l.store_code = g.store_code
  left join public.google_reviews r on r.location_id = l.id and r.removed_at is null
  left join lateral (
    select case
             when g.count_from is not null then r.review_create_time >= g.count_from
             when g.baseline_review_time is not null then r.review_create_time > g.baseline_review_time and r.google_review_id <> g.baseline_review_id
             else false
           end as after,
           (r.star_rating >= 3) as rated
  ) q on true
  group by l.store_code, l.display_name, g.monthly_target, g.baseline_review_id, g.baseline_review_time, g.count_from
  order by l.store_code;
$$;

/*
 * REVIEWS PER PERIOD by ORIGINAL creation date, Central time, live reviews only.
 *   p_unit 'week'  -> Monday-start weeks (Monday–Sunday);  'month' -> calendar months.
 * qualifying_count is the 3–5★ reviews in the period; average_rating covers every live review in it.
 */
create or replace function public.google_reviews_periods(p_store_code text, p_unit text)
returns table (period_start date, review_count bigint, qualifying_count bigint, average_rating numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_unit not in ('week', 'month') then
    raise exception 'google_reviews_periods: unit must be week or month' using errcode = 'invalid_parameter_value';
  end if;
  return query
  select date_trunc(p_unit, f.review_create_time at time zone 'America/Chicago')::date as ps,
         count(*)::bigint, (count(*) filter (where f.star_rating >= 3))::bigint, round(avg(f.star_rating)::numeric, 2)
    from public.google_reviews_feed f
   where f.removed_at is null and (p_store_code is null or f.store_code = p_store_code)
   group by 1 order by 1;
end;
$$;

revoke all on function public.google_review_goals_guard_count_from() from public, anon, authenticated;
revoke all on function public.google_review_set_reporting_cutoff(text, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.google_review_set_reporting_cutoff(text, timestamptz, text[]) to service_role;
revoke all on function public.google_review_goal_counts_v2(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.google_review_goal_counts_v2(timestamptz, timestamptz, timestamptz, timestamptz) to service_role;
revoke all on function public.google_reviews_periods(text, text) from public, anon, authenticated;
grant execute on function public.google_reviews_periods(text, text) to service_role;
