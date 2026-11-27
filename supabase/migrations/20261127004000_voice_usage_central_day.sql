-- ---------------------------------------------------------------------------
-- VOICE USAGE: THE CAPS' DAY IS CENTRAL (VOICE_INPUT_ENABLED; the owner, 27 Nov 2026).
--
-- The owner was asked whether the voice daily limit should reset at Manila or
-- Central midnight: "central". 20261127002000_voice_usage.sql counted the day
-- from Manila midnight (16:00 UTC), which for a store manager in Central time
-- reset the day mid-morning. `voice_usage_claim` now counts from midnight in
-- America/Chicago. Central has daylight saving, so the day start is Postgres's
-- own zone maths (`at time zone 'America/Chicago'`), never a fixed offset: a day
-- is 23 hours in March and 25 in November.
--
-- Same signature, grants and body as before; only the zone changes. The table
-- and its rows are unchanged.
--
-- Rollback: re-run voice_usage_claim from 20261127002000_voice_usage.sql.
-- ---------------------------------------------------------------------------

create or replace function public.voice_usage_claim(
  p_user_id text,
  p_store_id text,
  p_surface text,
  p_clip_seconds numeric,
  p_per_minute integer,
  p_per_day integer,
  p_user_seconds numeric,
  p_store_seconds numeric,
  p_company_seconds numeric,
  p_now timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_day_start timestamptz := date_trunc('day', coalesce(p_now, now()) at time zone 'America/Chicago') at time zone 'America/Chicago';
  v_clip numeric := least(60, greatest(0.5, coalesce(p_clip_seconds, 60)));
  v_minute_count integer;
  v_oldest timestamptz;
  v_day_count integer;
  v_user_seconds numeric;
  v_store_seconds numeric;
  v_company_seconds numeric;
  v_id uuid;
begin
  if p_user_id is null or p_user_id = '' then
    raise exception 'voice_usage_claim: user required';
  end if;

  -- One claim at a time: the counts below and the insert are one decision.
  perform pg_advisory_xact_lock(hashtext('public.voice_usage_claim'));

  select count(*), min(created_at) into v_minute_count, v_oldest
    from public.voice_usage
   where user_id = p_user_id
     and created_at > v_now - interval '60 seconds' and created_at <= v_now;
  if v_minute_count >= p_per_minute then
    return jsonb_build_object(
      'ok', false, 'reason', 'user_minute',
      'retry_after', greatest(1, ceil(extract(epoch from (v_oldest + interval '60 seconds' - v_now))))::integer
    );
  end if;

  select count(*), coalesce(sum(coalesce(audio_seconds, reported_seconds)), 0)
    into v_day_count, v_user_seconds
    from public.voice_usage
   where user_id = p_user_id
     and created_at >= v_day_start and created_at <= v_now;
  if v_day_count >= p_per_day or v_user_seconds + v_clip > p_user_seconds then
    return jsonb_build_object('ok', false, 'reason', 'user_day');
  end if;

  if p_store_id is not null and p_store_id <> '' then
    select coalesce(sum(coalesce(audio_seconds, reported_seconds)), 0)
      into v_store_seconds
      from public.voice_usage
     where store_id = p_store_id
       and created_at >= v_day_start and created_at <= v_now;
    if v_store_seconds + v_clip > p_store_seconds then
      return jsonb_build_object('ok', false, 'reason', 'store_day');
    end if;
  end if;

  select coalesce(sum(coalesce(audio_seconds, reported_seconds)), 0)
    into v_company_seconds
    from public.voice_usage
   where created_at >= v_day_start and created_at <= v_now;
  if v_company_seconds + v_clip > p_company_seconds then
    return jsonb_build_object('ok', false, 'reason', 'company_day');
  end if;

  insert into public.voice_usage (created_at, user_id, store_id, surface, reported_seconds)
  values (v_now, p_user_id, nullif(p_store_id, ''), p_surface, v_clip)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.voice_usage_claim(text, text, text, numeric, integer, integer, numeric, numeric, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.voice_usage_claim(text, text, text, numeric, integer, integer, numeric, numeric, numeric, timestamptz) to service_role;
