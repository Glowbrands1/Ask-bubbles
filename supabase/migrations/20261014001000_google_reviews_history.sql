-- GOOGLE REVIEWS — reviewer name, API-reported totals, monthly trend, and "older never overwrites newer".
-- Stores the reviewer's DISPLAY NAME only (no photo, no profile URL, no id).

alter table public.google_reviews add column if not exists reviewer_name text check (reviewer_name is null or length(reviewer_name) <= 200);
alter table public.google_review_locations
  add column if not exists api_total_review_count integer check (api_total_review_count is null or api_total_review_count >= 0),
  add column if not exists api_average_rating numeric(3,2),
  add column if not exists api_total_checked_at timestamptz;

drop function if exists public.google_review_apply_reviews(uuid, uuid, jsonb, boolean);

create or replace function public.google_review_apply_reviews(
  p_run uuid, p_location uuid, p_reviews jsonb, p_complete boolean,
  p_api_total integer default null, p_api_average numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.google_review_sync_runs%rowtype;
  v_loc public.google_review_locations%rowtype;
  v_item jsonb;
  v_existing public.google_reviews%rowtype;
  v_inserted int := 0; v_updated int := 0; v_unchanged int := 0; v_removed int := 0; v_restored int := 0;
  v_seen text[] := '{}';
  v_on_file int; v_would_remove int;
begin
  select * into v_run from public.google_review_sync_runs where id = p_run for update;
  if not found or v_run.status <> 'running' or v_run.mode <> 'save' then
    raise exception 'google_review_apply_reviews: no running save run' using errcode = 'invalid_parameter_value';
  end if;
  select * into v_loc from public.google_review_locations where id = p_location for update;
  if not found or v_loc.match_status not in ('matched', 'confirmed') or not v_loc.is_active then
    raise exception 'google_review_apply_reviews: location is not linked' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_reviews) <> 'array' then
    raise exception 'google_review_apply_reviews: reviews must be an array' using errcode = 'invalid_parameter_value';
  end if;

  for v_item in select * from jsonb_array_elements(p_reviews) loop
    v_seen := v_seen || (v_item ->> 'google_review_id');
    select * into v_existing from public.google_reviews
     where location_id = p_location and google_review_id = (v_item ->> 'google_review_id') for update;

    if not found then
      insert into public.google_reviews (
        location_id, google_review_id, review_resource_name, star_rating, comment,
        review_create_time, review_update_time, reply_comment, reply_update_time,
        reviewer_name, content_hash, first_seen_run_id, last_seen_run_id
      ) values (
        p_location, v_item ->> 'google_review_id', v_item ->> 'review_resource_name',
        (v_item ->> 'star_rating')::smallint, v_item ->> 'comment',
        (v_item ->> 'review_create_time')::timestamptz, (v_item ->> 'review_update_time')::timestamptz,
        v_item ->> 'reply_comment', nullif(v_item ->> 'reply_update_time', '')::timestamptz,
        v_item ->> 'reviewer_name', v_item ->> 'content_hash', p_run, p_run
      );
      v_inserted := v_inserted + 1;
    elsif (v_item ->> 'review_update_time')::timestamptz < v_existing.review_update_time then
      /* NEVER let older data overwrite newer data: a stale read only proves the review still exists. */
      update public.google_reviews
         set last_seen_run_id = p_run, last_seen_at = now(), not_seen_count = 0, removed_at = null
       where id = v_existing.id;
      v_unchanged := v_unchanged + 1;
    elsif v_existing.content_hash = (v_item ->> 'content_hash') then
      update public.google_reviews
         set last_seen_run_id = p_run, last_seen_at = now(), not_seen_count = 0,
             removed_at = null
       where id = v_existing.id;
      if v_existing.removed_at is not null then v_restored := v_restored + 1; else v_unchanged := v_unchanged + 1; end if;
    else
      update public.google_reviews
         set star_rating = (v_item ->> 'star_rating')::smallint, comment = v_item ->> 'comment',
             review_update_time = (v_item ->> 'review_update_time')::timestamptz,
             reply_comment = v_item ->> 'reply_comment',
             reply_update_time = nullif(v_item ->> 'reply_update_time', '')::timestamptz,
             reviewer_name = v_item ->> 'reviewer_name',
             content_hash = v_item ->> 'content_hash',
             last_seen_run_id = p_run, last_seen_at = now(), last_changed_at = now(),
             not_seen_count = 0, removed_at = null
       where id = v_existing.id;
      if v_existing.removed_at is not null then v_restored := v_restored + 1; end if;
      v_updated := v_updated + 1;
    end if;
  end loop;

  if p_complete then
    select count(*) into v_on_file from public.google_reviews where location_id = p_location and removed_at is null;
    select count(*) into v_would_remove from public.google_reviews
     where location_id = p_location and removed_at is null and not (google_review_id = any (v_seen));
    if v_would_remove > greatest(5, v_on_file / 4) then
      raise exception 'google_review_removal_guard: refusing to mark % of % reviews removed', v_would_remove, v_on_file
        using errcode = 'check_violation';
    end if;
    update public.google_reviews
       set not_seen_count = not_seen_count + 1, removed_at = now()
     where location_id = p_location and removed_at is null and not (google_review_id = any (v_seen));
    get diagnostics v_removed = row_count;
  end if;

  update public.google_review_locations
     set last_sync_at = now(),
         last_sync_status = case when p_complete then 'complete' else 'incomplete' end,
         last_sync_error = null,
         api_total_review_count = coalesce(p_api_total, api_total_review_count),
         api_average_rating = coalesce(p_api_average, api_average_rating),
         api_total_checked_at = case when p_api_total is not null then now() else api_total_checked_at end
   where id = p_location;

  update public.google_review_sync_runs
     set locations_attempted = locations_attempted + 1,
         locations_complete = locations_complete + (case when p_complete then 1 else 0 end),
         reviews_fetched = reviews_fetched + jsonb_array_length(p_reviews),
         reviews_inserted = reviews_inserted + v_inserted,
         reviews_updated = reviews_updated + v_updated,
         reviews_unchanged = reviews_unchanged + v_unchanged,
         reviews_marked_removed = reviews_marked_removed + v_removed,
         reviews_restored = reviews_restored + v_restored
   where id = p_run;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'unchanged', v_unchanged,
                            'removed', v_removed, 'restored', v_restored);
end;
$$;

create or replace function public.google_reviews_search(
  p_store_code text, p_rating smallint, p_reply text, p_from timestamptz, p_to timestamptz,
  p_removed boolean, p_limit integer, p_offset integer
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_rows jsonb;
begin
  if p_reply is not null and p_reply not in ('answered', 'unanswered') then
    raise exception 'google_reviews_search: bad reply filter' using errcode = 'invalid_parameter_value';
  end if;
  if p_rating is not null and p_rating not between 1 and 5 then
    raise exception 'google_reviews_search: bad rating filter' using errcode = 'invalid_parameter_value';
  end if;

  select count(*) into v_total
    from public.google_reviews_feed f
   where (p_store_code is null or f.store_code = p_store_code)
     and (p_rating is null or f.star_rating = p_rating)
     and (p_reply is null or (p_reply = 'answered') = f.has_reply)
     and (p_from is null or f.review_create_time >= p_from)
     and (p_to is null or f.review_create_time < p_to)
     and (coalesce(p_removed, false) = (f.removed_at is not null));

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from (
    select f.id, f.store_code, f.store_name, f.star_rating, f.comment, f.review_create_time,
           f.review_update_time, f.reply_comment, f.reply_update_time, f.has_reply, f.removed_at, f.reviewer_name
      from public.google_reviews_feed f
     where (p_store_code is null or f.store_code = p_store_code)
       and (p_rating is null or f.star_rating = p_rating)
       and (p_reply is null or (p_reply = 'answered') = f.has_reply)
       and (p_from is null or f.review_create_time >= p_from)
       and (p_to is null or f.review_create_time < p_to)
       and (coalesce(p_removed, false) = (f.removed_at is not null))
     order by f.review_create_time desc, f.id
     limit v_limit offset v_offset
  ) r;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

create or replace view public.google_review_location_stats as
select
  l.id as location_id, l.store_code, l.display_name,
  l.address_line1, l.address_line2, l.city, l.state, l.postal_code,
  l.match_status, l.match_confidence, l.is_active,
  l.last_sync_at, l.last_sync_status, l.last_sync_error,
  count(r.id) filter (where r.removed_at is null) as review_count,
  round(avg(r.star_rating) filter (where r.removed_at is null)::numeric, 2) as average_rating,
  count(r.id) filter (where r.removed_at is null and r.reply_comment is null) as unanswered_count,
  count(r.id) filter (where r.removed_at is null and r.star_rating = 1) as rating_1,
  count(r.id) filter (where r.removed_at is null and r.star_rating = 2) as rating_2,
  count(r.id) filter (where r.removed_at is null and r.star_rating = 3) as rating_3,
  count(r.id) filter (where r.removed_at is null and r.star_rating = 4) as rating_4,
  count(r.id) filter (where r.removed_at is null and r.star_rating = 5) as rating_5,
  max(r.review_create_time) filter (where r.removed_at is null) as latest_review_at,
  l.api_total_review_count, l.api_average_rating, l.api_total_checked_at,
  min(r.review_create_time) filter (where r.removed_at is null) as oldest_review_at
from public.google_review_locations l
left join public.google_reviews r on r.location_id = l.id
group by l.id;

create or replace view public.google_reviews_feed as
select
  r.id, r.location_id, l.store_code, l.display_name as store_name,
  r.google_review_id, r.star_rating, r.comment, r.review_create_time, r.review_update_time,
  r.reply_comment, r.reply_update_time, r.has_reply, r.last_changed_at, r.removed_at,
  r.reviewer_name
from public.google_reviews r
join public.google_review_locations l on l.id = r.location_id;

/* Monthly review count and average by ORIGINAL review date (Central time), live reviews only. */
create or replace function public.google_reviews_monthly(p_store_code text)
returns table (month date, review_count bigint, average_rating numeric)
language sql stable security definer set search_path = ''
as $$
  select date_trunc('month', f.review_create_time at time zone 'America/Chicago')::date,
         count(*), round(avg(f.star_rating)::numeric, 2)
    from public.google_reviews_feed f
   where f.removed_at is null and (p_store_code is null or f.store_code = p_store_code)
   group by 1 order by 1;
$$;

revoke all on function public.google_review_apply_reviews(uuid, uuid, jsonb, boolean, integer, numeric) from public, anon, authenticated;
grant execute on function public.google_review_apply_reviews(uuid, uuid, jsonb, boolean, integer, numeric) to service_role;
revoke all on function public.google_reviews_monthly(text) from public, anon, authenticated;
grant execute on function public.google_reviews_monthly(text) to service_role;
revoke all on public.google_review_location_stats from anon, authenticated;
revoke all on public.google_reviews_feed from anon, authenticated;
