-- ---------------------------------------------------------------------------
-- VOICE USAGE (VOICE_INPUT_ENABLED; the owner, 27 Nov 2026).
--
-- One row per voice clip sent for transcription, from any of the four AI chat
-- boxes. The caps (src/lib/voice/voice-limits.ts) are shared by all four boxes:
-- they count by person, store and company, never by box.
--
-- `voice_usage_claim` decides and records in ONE step, under a transaction
-- advisory lock, so two overlapping requests cannot both pass a cap: it counts
-- pending plus succeeded rows since Manila midnight (and in the last 60 seconds
-- for the per-minute cap) and, when every cap has room, inserts a PENDING row
-- and returns its id. The vendor is called only after that row exists.
--
-- A pending row counts as the clip length the browser reported (clamped to
-- 0.5-60 s) until it is finished, and it is never released: a crash still
-- counts. `voice_usage_finish` marks it succeeded (with the provider's audio
-- length) or failed. No audio, transcript, name or email is stored here.
--
-- RLS is enabled and forced with no policies, and anon / authenticated hold no
-- grant on the table or the functions: a signed-in browser cannot insert,
-- update or read anyone's counters, its own included. Only the server, under
-- the secret key and after its access check, calls the two functions.
--
-- Rollback:
--   drop function if exists public.voice_usage_finish(uuid, text, numeric);
--   drop function if exists public.voice_usage_claim(text, text, text, numeric, integer, integer, numeric, numeric, numeric, timestamptz);
--   drop table if exists public.voice_usage;
-- ---------------------------------------------------------------------------

create table if not exists public.voice_usage (
  id uuid primary key default extensions.gen_random_uuid(),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  user_id text not null,
  store_id text,
  surface text not null check (surface in ('chat', 'overview', 'report', 'l10')),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  reported_seconds numeric(6, 2) not null check (reported_seconds >= 0.5 and reported_seconds <= 60),
  audio_seconds numeric(8, 2) check (audio_seconds is null or audio_seconds >= 0)
);

create index if not exists voice_usage_user_created on public.voice_usage (user_id, created_at);
create index if not exists voice_usage_store_created on public.voice_usage (store_id, created_at) where store_id is not null;
create index if not exists voice_usage_created on public.voice_usage (created_at);

alter table public.voice_usage enable row level security;
alter table public.voice_usage force row level security;
revoke all on public.voice_usage from anon, authenticated;
grant all on public.voice_usage to service_role;

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
  v_day_start timestamptz := date_trunc('day', coalesce(p_now, now()) at time zone 'Asia/Manila') at time zone 'Asia/Manila';
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
   where user_id = p_user_id and status in ('pending', 'succeeded')
     and created_at > v_now - interval '60 seconds' and created_at <= v_now;
  if v_minute_count >= p_per_minute then
    return jsonb_build_object(
      'ok', false, 'reason', 'user_minute',
      'retry_after', greatest(1, ceil(extract(epoch from (v_oldest + interval '60 seconds' - v_now))))::integer
    );
  end if;

  select count(*),
         coalesce(sum(case when status = 'pending' then reported_seconds else coalesce(audio_seconds, reported_seconds) end), 0)
    into v_day_count, v_user_seconds
    from public.voice_usage
   where user_id = p_user_id and status in ('pending', 'succeeded')
     and created_at >= v_day_start and created_at <= v_now;
  if v_day_count >= p_per_day or v_user_seconds + v_clip > p_user_seconds then
    return jsonb_build_object('ok', false, 'reason', 'user_day');
  end if;

  if p_store_id is not null and p_store_id <> '' then
    select coalesce(sum(case when status = 'pending' then reported_seconds else coalesce(audio_seconds, reported_seconds) end), 0)
      into v_store_seconds
      from public.voice_usage
     where store_id = p_store_id and status in ('pending', 'succeeded')
       and created_at >= v_day_start and created_at <= v_now;
    if v_store_seconds + v_clip > p_store_seconds then
      return jsonb_build_object('ok', false, 'reason', 'store_day');
    end if;
  end if;

  select coalesce(sum(case when status = 'pending' then reported_seconds else coalesce(audio_seconds, reported_seconds) end), 0)
    into v_company_seconds
    from public.voice_usage
   where status in ('pending', 'succeeded')
     and created_at >= v_day_start and created_at <= v_now;
  if v_company_seconds + v_clip > p_company_seconds then
    return jsonb_build_object('ok', false, 'reason', 'company_day');
  end if;

  insert into public.voice_usage (created_at, user_id, store_id, surface, reported_seconds)
  values (v_now, p_user_id, nullif(p_store_id, ''), p_surface, v_clip)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.voice_usage_finish(
  p_id uuid,
  p_status text,
  p_audio_seconds numeric
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'voice_usage_finish: status must be succeeded or failed';
  end if;
  update public.voice_usage
     set status = p_status,
         audio_seconds = case when p_audio_seconds is null then null else least(60, greatest(0, p_audio_seconds)) end,
         finished_at = now()
   where id = p_id and status = 'pending';
end;
$$;

revoke all on function public.voice_usage_claim(text, text, text, numeric, integer, integer, numeric, numeric, numeric, timestamptz) from public, anon, authenticated;
revoke all on function public.voice_usage_finish(uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.voice_usage_claim(text, text, text, numeric, integer, integer, numeric, numeric, numeric, timestamptz) to service_role;
grant execute on function public.voice_usage_finish(uuid, text, numeric) to service_role;
