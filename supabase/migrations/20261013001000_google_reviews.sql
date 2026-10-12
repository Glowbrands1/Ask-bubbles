-- ============================================================================
-- GOOGLE REVIEWS — Buff City Soap's seven approved Business Profiles, read-only
-- ============================================================================
--
-- Additive only: this file creates new objects and touches no existing table,
-- row, policy, grant or function. Rollback: supabase/rollbacks/
-- 20261013001000_google_reviews_down.sql (tested in CI by the migration test).
--
-- WHAT THIS CREATES
--
--   google_business_connections   the ONE active OAuth link to a Google account;
--                                 the refresh token is stored SEALED (AES-256-GCM
--                                 done in the application with a key that never
--                                 reaches the database)
--   google_review_locations       THE ALLOWLIST. Exactly the approved Buff City
--                                 Soap stores, seeded below. A review can only
--                                 ever be attached to one of these rows. Linking
--                                 a row to a Google location is a separate,
--                                 audited step.
--   google_reviews                reviews, keyed by (location, Google review id)
--   google_review_sync_runs       one row per sync attempt; the run lock
--   google_review_audit           append-only record of who linked/unlinked what
--   three views and six functions (claim/finish a run, record a link, apply a
--   location's reviews, record/revoke the connection)
--
-- BRAND ISOLATION IS STRUCTURAL, NOT A CONVENTION
--
--   * `google_review_locations.brand` is CHECKed to 'buff_city_soap'.
--   * `google_reviews.location_id` is a foreign key to that allowlist, so a
--     review for any other business has nowhere to be stored.
--   * A trigger refuses any review whose Google resource name is not under the
--     location row's own `accounts/{a}/locations/{l}` — a review cannot be filed
--     against the wrong store even by a direct write.
--   * Google location ids are never derived from Woven ids or store numbers.
--
-- WHAT IS DELIBERATELY NOT STORED: the reviewer's name, profile photo or any
-- reviewer identifier. A review row holds the rating, the text, the owner's
-- reply and timestamps.
--
-- PRIVILEGES: row level security is enabled and forced on every table, and
-- everything is revoked from `anon` and `authenticated`. The application reads
-- and writes with the server-side secret key only. The functions are SECURITY
-- DEFINER with an empty search_path and are executable by service_role only.
--
-- Idempotent: safe to run twice.

-- ------------------------------------------------------------ connection ---

create table if not exists public.google_business_connections (
  id uuid primary key default extensions.gen_random_uuid(),
  status text not null default 'active'
    check (status in ('active', 'revoked', 'expired', 'error')),
  /* "v1.<iv>.<tag>.<ciphertext>" — sealed by the application. Never a plaintext token. */
  refresh_token_sealed text not null
    check (refresh_token_sealed ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' and length(refresh_token_sealed) <= 4096),
  token_key_version smallint not null default 1 check (token_key_version > 0),
  scopes text[] not null default '{}',
  connected_by text not null check (length(connected_by) between 1 and 200),
  connected_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,60}$'),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

/* At most ONE active connection. */
create unique index if not exists google_business_connections_one_active
  on public.google_business_connections ((true)) where status = 'active';

drop trigger if exists google_business_connections_touch on public.google_business_connections;
create trigger google_business_connections_touch
  before update on public.google_business_connections
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------- the store allowlist ---

create table if not exists public.google_review_locations (
  id uuid primary key default extensions.gen_random_uuid(),
  brand text not null default 'buff_city_soap' check (brand = 'buff_city_soap'),
  /* Buff City Soap's own store number. NOT a Woven id, NOT an Ask Bubbles location id. */
  store_code text not null check (store_code ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,15}$'),
  display_name text not null check (length(display_name) between 1 and 160),
  address_line1 text not null check (length(address_line1) between 1 and 200),
  address_line2 text check (address_line2 is null or length(address_line2) <= 200),
  city text not null check (length(city) between 1 and 100),
  state text not null check (state ~ '^[A-Z]{2}$'),
  postal_code text not null check (postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'),

  /*
   * THE ACCEPTED LINK. Both set together, or both null. Written only by
   * `google_review_record_link`, from an exact store-code + address match or an
   * administrator's confirmation of a candidate. v4 review resource names are
   * `{google_account_name}/{google_location_name}/reviews/{id}`.
   */
  google_account_name text check (google_account_name is null or google_account_name ~ '^accounts/[0-9]{1,30}$'),
  google_location_name text check (google_location_name is null or google_location_name ~ '^locations/[0-9]{1,30}$'),
  match_status text not null default 'unmatched'
    check (match_status in ('unmatched', 'matched', 'candidate', 'mismatch', 'ambiguous', 'confirmed')),
  match_confidence text not null default 'none' check (match_confidence in ('none', 'low', 'medium', 'high')),
  /* Why: which fields agreed. Field NAMES and booleans only — no personal data. */
  match_evidence jsonb not null default '{}'::jsonb,
  matched_at timestamptz,
  confirmed_by text check (confirmed_by is null or length(confirmed_by) between 1 and 200),
  confirmed_at timestamptz,

  /* Cross-system references, set only by a person after review. Never inferred. */
  woven_location_id text check (woven_location_id is null or woven_location_id ~ '^[A-Za-z0-9._:-]{1,64}$'),
  ask_bubbles_location_id text check (ask_bubbles_location_id is null or ask_bubbles_location_id ~ '^loc-[A-Za-z0-9-]{1,16}$'),

  is_active boolean not null default true,
  last_sync_at timestamptz,
  last_sync_status text check (last_sync_status is null or last_sync_status in ('complete', 'incomplete', 'failed')),
  last_sync_error text check (last_sync_error is null or last_sync_error ~ '^[a-z0-9_]{1,60}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint google_review_locations_store_code_key unique (store_code),
  constraint google_review_locations_link_pair
    check ((google_account_name is null) = (google_location_name is null)),
  constraint google_review_locations_link_matches_status
    check ((match_status in ('matched', 'confirmed')) = (google_location_name is not null))
);

/* One Google location can belong to at most one store. */
create unique index if not exists google_review_locations_google_location_key
  on public.google_review_locations (google_account_name, google_location_name)
  where google_location_name is not null;

drop trigger if exists google_review_locations_touch on public.google_review_locations;
create trigger google_review_locations_touch
  before update on public.google_review_locations
  for each row execute function public.touch_updated_at();

/*
 * THE SEVEN APPROVED STORES (confirmed by Buff City Soap; all Verified in
 * Google Business Profile). Adding a store is a reviewed migration, nothing
 * else. Mirrored by src/config/company/google-reviews.ts; a test fails if the
 * two ever differ.
 */
insert into public.google_review_locations
  (store_code, display_name, address_line1, address_line2, city, state, postal_code)
values
  ('219', 'Lee''s Summit, MO', '2050 NW Lowenstein Dr', 'Ste C', 'Lee''s Summit', 'MO', '64081'),
  ('225', 'Sioux Falls, SD', '4025 W 41st St', null, 'Sioux Falls', 'SD', '57106'),
  ('236', 'Grand Island, NE', '3429 W 13th St', 'Ste B', 'Grand Island', 'NE', '68803'),
  ('264', 'Omaha, NE', '7810 West Dodge Rd', null, 'Omaha', 'NE', '68114'),
  ('338', 'Sioux Falls, SD', '5902 E 18th St', null, 'Sioux Falls', 'SD', '57110'),
  ('66', 'Kearney, NE', '5210 2nd Ave', null, 'Kearney', 'NE', '68847'),
  ('67', 'Bellevue, NE', '10110 S 15th St', 'Ste 104', 'Bellevue', 'NE', '68123')
on conflict (store_code) do nothing;

-- ---------------------------------------------------------------- audit ---

create table if not exists public.google_review_audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor text not null check (length(actor) between 1 and 200),
  action text not null check (action in (
    'connection_created', 'connection_revoked', 'connection_expired',
    'link_matched', 'link_candidate', 'link_mismatch', 'link_ambiguous',
    'link_confirmed', 'link_cleared', 'sync_run'
  )),
  store_code text check (store_code is null or store_code ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,15}$'),
  /* Codes, counts and resource names only. Never a token, a review text or a reviewer. */
  detail jsonb not null default '{}'::jsonb
);

create or replace function public.google_review_audit_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'google_review_audit is append-only' using errcode = 'check_violation';
end;
$$;

drop trigger if exists google_review_audit_no_change on public.google_review_audit;
create trigger google_review_audit_no_change
  before update or delete on public.google_review_audit
  for each row execute function public.google_review_audit_guard();

-- ------------------------------------------------------------- sync runs ---

create table if not exists public.google_review_sync_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'partial', 'failed', 'refused')),
  mode text not null default 'save' check (mode in ('dry_run', 'save')),
  requested_by text not null check (length(requested_by) between 1 and 200),
  locations_attempted integer not null default 0 check (locations_attempted >= 0),
  locations_complete integer not null default 0 check (locations_complete >= 0),
  reviews_fetched integer not null default 0 check (reviews_fetched >= 0),
  reviews_inserted integer not null default 0 check (reviews_inserted >= 0),
  reviews_updated integer not null default 0 check (reviews_updated >= 0),
  reviews_unchanged integer not null default 0 check (reviews_unchanged >= 0),
  reviews_marked_removed integer not null default 0 check (reviews_marked_removed >= 0),
  reviews_restored integer not null default 0 check (reviews_restored >= 0),
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_]{1,60}$'),
  error_summary text check (error_summary is null or length(error_summary) <= 300),
  /* Counts and codes only. */
  stats jsonb not null default '{}'::jsonb
);

/* ONE run at a time. A run that never finished is abandoned by the next claim. */
create unique index if not exists google_review_sync_runs_one_running
  on public.google_review_sync_runs ((true)) where status = 'running';
create index if not exists google_review_sync_runs_started
  on public.google_review_sync_runs (started_at desc);

-- --------------------------------------------------------------- reviews ---

create table if not exists public.google_reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  location_id uuid not null references public.google_review_locations (id) on delete restrict,
  google_review_id text not null check (length(google_review_id) between 1 and 200),
  /* accounts/{a}/locations/{l}/reviews/{id} */
  review_resource_name text not null check (length(review_resource_name) between 1 and 400),
  star_rating smallint not null check (star_rating between 1 and 5),
  comment text check (comment is null or length(comment) <= 5000),
  review_create_time timestamptz not null,
  review_update_time timestamptz not null,
  reply_comment text check (reply_comment is null or length(reply_comment) <= 5000),
  reply_update_time timestamptz,
  has_reply boolean generated always as (reply_comment is not null) stored,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  first_seen_run_id uuid references public.google_review_sync_runs (id) on delete set null,
  last_seen_run_id uuid references public.google_review_sync_runs (id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  /*
   * Consecutive COMPLETE reads that did not return this review. It is marked
   * removed (never deleted) only after a complete read, and returns to normal
   * if Google serves it again. An incomplete read changes nothing.
   */
  not_seen_count integer not null default 0 check (not_seen_count >= 0),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_reviews_location_review_key unique (location_id, google_review_id),
  constraint google_reviews_reply_pair check (reply_update_time is null or reply_comment is not null)
);

create index if not exists google_reviews_location_time
  on public.google_reviews (location_id, review_create_time desc);
create index if not exists google_reviews_unanswered
  on public.google_reviews (location_id, review_create_time desc)
  where reply_comment is null and removed_at is null;
create index if not exists google_reviews_rating
  on public.google_reviews (star_rating, review_create_time desc);

drop trigger if exists google_reviews_touch on public.google_reviews;
create trigger google_reviews_touch
  before update on public.google_reviews
  for each row execute function public.touch_updated_at();

/*
 * A REVIEW BELONGS TO ITS LOCATION'S OWN GOOGLE LOCATION, OR IT IS NOT STORED.
 * The resource name must be exactly `{account}/{location}/reviews/{reviewId}`
 * for the location row it is attached to, and that row must hold an accepted
 * link. Enforced on every insert and update, whoever writes.
 */
create or replace function public.google_reviews_check_location()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account text;
  v_location text;
  v_status text;
  v_active boolean;
begin
  select l.google_account_name, l.google_location_name, l.match_status, l.is_active
    into v_account, v_location, v_status, v_active
    from public.google_review_locations l
   where l.id = new.location_id;

  if v_location is null or v_status not in ('matched', 'confirmed') then
    raise exception 'google_reviews: location has no accepted Google link' using errcode = 'check_violation';
  end if;
  if not v_active then
    raise exception 'google_reviews: location is not active' using errcode = 'check_violation';
  end if;
  if new.review_resource_name <> v_account || '/' || v_location || '/reviews/' || new.google_review_id then
    raise exception 'google_reviews: review does not belong to this location''s Google location' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists google_reviews_check_location on public.google_reviews;
create trigger google_reviews_check_location
  before insert or update of location_id, google_review_id, review_resource_name on public.google_reviews
  for each row execute function public.google_reviews_check_location();

-- ------------------------------------------------------------ functions ---

/* Claim the single run lock. Returns the new run id, or null when a fresh run is already going. */
create or replace function public.google_review_claim_run(p_requested_by text, p_mode text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_mode not in ('dry_run', 'save') then
    raise exception 'google_review_claim_run: bad mode' using errcode = 'invalid_parameter_value';
  end if;

  /* A run that has been "running" for over 30 minutes died without finishing. */
  update public.google_review_sync_runs
     set status = 'failed', finished_at = now(), error_code = 'abandoned',
         error_summary = 'A previous run did not finish and was abandoned.'
   where status = 'running' and started_at < now() - interval '30 minutes';

  begin
    insert into public.google_review_sync_runs (requested_by, mode)
    values (left(p_requested_by, 200), p_mode)
    returning id into v_id;
  exception when unique_violation then
    return null;
  end;
  return v_id;
end;
$$;

create or replace function public.google_review_finish_run(
  p_run uuid, p_status text, p_stats jsonb, p_error_code text, p_error_summary text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('succeeded', 'partial', 'failed', 'refused') then
    raise exception 'google_review_finish_run: bad status' using errcode = 'invalid_parameter_value';
  end if;
  update public.google_review_sync_runs
     set status = p_status,
         finished_at = now(),
         error_code = p_error_code,
         error_summary = left(p_error_summary, 300),
         stats = coalesce(p_stats, '{}'::jsonb)
   where id = p_run and status = 'running';
  insert into public.google_review_audit (actor, action, detail)
  select r.requested_by, 'sync_run', jsonb_build_object('run_id', r.id, 'status', p_status, 'mode', r.mode, 'error_code', p_error_code)
    from public.google_review_sync_runs r where r.id = p_run;
end;
$$;

/*
 * Record the outcome of matching one approved store against Google. `matched`
 * (an exact store code AND address) and `confirmed` (an administrator accepted a
 * candidate) set the link; every other status records evidence only. A
 * `confirmed` link is never downgraded by a later automatic result.
 */
create or replace function public.google_review_record_link(
  p_store_code text, p_account text, p_location text, p_status text,
  p_confidence text, p_evidence jsonb, p_actor text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.google_review_locations%rowtype;
  v_action text;
begin
  if p_status not in ('matched', 'confirmed', 'candidate', 'mismatch', 'ambiguous', 'unmatched') then
    raise exception 'google_review_record_link: bad status' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_row from public.google_review_locations where store_code = p_store_code for update;
  if not found then
    raise exception 'google_review_record_link: unknown store code' using errcode = 'foreign_key_violation';
  end if;

  if v_row.match_status = 'confirmed' and p_status <> 'confirmed' then
    return 'kept_confirmed';
  end if;

  if p_status in ('matched', 'confirmed') then
    update public.google_review_locations
       set google_account_name = p_account, google_location_name = p_location,
           match_status = p_status, match_confidence = coalesce(p_confidence, 'high'),
           match_evidence = coalesce(p_evidence, '{}'::jsonb), matched_at = now(),
           confirmed_by = case when p_status = 'confirmed' then left(p_actor, 200) else confirmed_by end,
           confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end
     where id = v_row.id;
  else
    /* Evidence only: a non-accepted result also releases a previously automatic link. */
    update public.google_review_locations
       set google_account_name = null, google_location_name = null,
           match_status = p_status, match_confidence = coalesce(p_confidence, 'none'),
           match_evidence = coalesce(p_evidence, '{}'::jsonb)
     where id = v_row.id;
  end if;

  v_action := case p_status
    when 'matched' then 'link_matched' when 'confirmed' then 'link_confirmed'
    when 'candidate' then 'link_candidate' when 'mismatch' then 'link_mismatch'
    when 'ambiguous' then 'link_ambiguous' else 'link_cleared' end;
  /* Only changes are audited, so an unchanged daily match does not flood the log. */
  if v_row.match_status is distinct from p_status
     or v_row.google_location_name is distinct from (case when p_status in ('matched', 'confirmed') then p_location end) then
    insert into public.google_review_audit (actor, action, store_code, detail)
    values (left(p_actor, 200), v_action, p_store_code,
            jsonb_build_object('status', p_status, 'confidence', p_confidence, 'account', p_account, 'location', p_location));
  end if;
  return p_status;
end;
$$;

/*
 * APPLY ONE LOCATION'S REVIEWS from a sync run, in one transaction.
 *
 *   p_reviews   jsonb array of {google_review_id, review_resource_name,
 *               star_rating, comment, review_create_time, review_update_time,
 *               reply_comment, reply_update_time, content_hash}
 *   p_complete  true only when EVERY page was read without error or truncation
 *
 * New reviews are inserted, changed ones (different content_hash) updated,
 * identical ones only touched. Reviews the read did not return are marked
 * removed ONLY when p_complete is true, never deleted, and a mass-removal guard
 * refuses a read that would remove more than 25% of what is on file (at least 5)
 * — a half-answered API is not evidence that reviews vanished.
 */
create or replace function public.google_review_apply_reviews(
  p_run uuid, p_location uuid, p_reviews jsonb, p_complete boolean
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
        content_hash, first_seen_run_id, last_seen_run_id
      ) values (
        p_location, v_item ->> 'google_review_id', v_item ->> 'review_resource_name',
        (v_item ->> 'star_rating')::smallint, v_item ->> 'comment',
        (v_item ->> 'review_create_time')::timestamptz, (v_item ->> 'review_update_time')::timestamptz,
        v_item ->> 'reply_comment', nullif(v_item ->> 'reply_update_time', '')::timestamptz,
        v_item ->> 'content_hash', p_run, p_run
      );
      v_inserted := v_inserted + 1;
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
         last_sync_error = null
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

/*
 * An administrator clears a store's link (for example the Google profile was
 * replaced). Stored reviews are kept; no new review can attach until the store
 * is linked again, because the link is what the review trigger checks.
 */
create or replace function public.google_review_clear_link(p_store_code text, p_actor text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.google_review_locations
     set google_account_name = null, google_location_name = null, match_status = 'unmatched',
         match_confidence = 'none', match_evidence = '{}'::jsonb, confirmed_by = null, confirmed_at = null
   where store_code = p_store_code and google_location_name is not null
   returning id into v_id;
  if v_id is null then return false; end if;
  insert into public.google_review_audit (actor, action, store_code, detail)
  values (left(p_actor, 200), 'link_cleared', p_store_code, '{}'::jsonb);
  return true;
end;
$$;

/* Record that a location's read failed, without touching its reviews. */
create or replace function public.google_review_note_location_failure(p_run uuid, p_location uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.google_review_locations
     set last_sync_at = now(), last_sync_status = 'failed',
         last_sync_error = case when p_code ~ '^[a-z0-9_]{1,60}$' then p_code else 'unknown' end
   where id = p_location;
  update public.google_review_sync_runs
     set locations_attempted = locations_attempted + 1
   where id = p_run and status = 'running';
end;
$$;

/* Make `p_sealed` the single active connection (revoking any previous one). */
create or replace function public.google_review_set_connection(p_sealed text, p_scopes text[], p_actor text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.google_business_connections
     set status = 'revoked', revoked_at = now()
   where status = 'active';
  insert into public.google_business_connections (refresh_token_sealed, scopes, connected_by)
  values (p_sealed, coalesce(p_scopes, '{}'), left(p_actor, 200))
  returning id into v_id;
  insert into public.google_review_audit (actor, action, detail)
  values (left(p_actor, 200), 'connection_created', jsonb_build_object('connection_id', v_id, 'scopes', coalesce(p_scopes, '{}')));
  return v_id;
end;
$$;

create or replace function public.google_review_end_connection(p_status text, p_error_code text, p_actor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_status not in ('revoked', 'expired', 'error') then
    raise exception 'google_review_end_connection: bad status' using errcode = 'invalid_parameter_value';
  end if;
  update public.google_business_connections
     set status = p_status, revoked_at = now(), last_error_code = p_error_code
   where status = 'active'
   returning id into v_id;
  if v_id is not null then
    insert into public.google_review_audit (actor, action, detail)
    values (left(p_actor, 200), case when p_status = 'expired' then 'connection_expired' else 'connection_revoked' end,
            jsonb_build_object('connection_id', v_id, 'error_code', p_error_code));
  end if;
end;
$$;

/*
 * THE REVIEW LIST, filtered and paged on the server, with the total.
 *
 *   p_store_code  one approved store, or null for all
 *   p_rating      exactly 1..5, or null
 *   p_reply       'answered' | 'unanswered' | null
 *   p_from/p_to   review creation time bounds (inclusive / exclusive), or null
 *   p_removed     true to list reviews Google stopped returning, false for live ones
 *
 * Newest first. The page size is capped at 100. Returns {total, rows}.
 */
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
           f.review_update_time, f.reply_comment, f.reply_update_time, f.has_reply, f.removed_at
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

-- ---------------------------------------------------------------- views ---

create or replace view public.google_review_location_stats as
select
  l.id as location_id,
  l.store_code,
  l.display_name,
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
  max(r.review_create_time) filter (where r.removed_at is null) as latest_review_at
from public.google_review_locations l
left join public.google_reviews r on r.location_id = l.id
group by l.id;

create or replace view public.google_reviews_feed as
select
  r.id, r.location_id, l.store_code, l.display_name as store_name,
  r.google_review_id, r.star_rating, r.comment, r.review_create_time, r.review_update_time,
  r.reply_comment, r.reply_update_time, r.has_reply, r.last_changed_at, r.removed_at
from public.google_reviews r
join public.google_review_locations l on l.id = r.location_id;

-- ------------------------------------------------- privileges and RLS -----

alter table public.google_business_connections enable row level security;
alter table public.google_business_connections force row level security;
alter table public.google_review_locations enable row level security;
alter table public.google_review_locations force row level security;
alter table public.google_reviews enable row level security;
alter table public.google_reviews force row level security;
alter table public.google_review_sync_runs enable row level security;
alter table public.google_review_sync_runs force row level security;
alter table public.google_review_audit enable row level security;
alter table public.google_review_audit force row level security;

revoke all on public.google_business_connections from anon, authenticated;
revoke all on public.google_review_locations from anon, authenticated;
revoke all on public.google_reviews from anon, authenticated;
revoke all on public.google_review_sync_runs from anon, authenticated;
revoke all on public.google_review_audit from anon, authenticated;
revoke all on public.google_review_location_stats from anon, authenticated;
revoke all on public.google_reviews_feed from anon, authenticated;
revoke all on sequence public.google_review_audit_id_seq from anon, authenticated;

revoke all on function public.google_review_claim_run(text, text) from public, anon, authenticated;
revoke all on function public.google_review_finish_run(uuid, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.google_review_record_link(text, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.google_review_apply_reviews(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.google_review_note_location_failure(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.google_review_clear_link(text, text) from public, anon, authenticated;
revoke all on function public.google_review_set_connection(text, text[], text) from public, anon, authenticated;
revoke all on function public.google_review_end_connection(text, text, text) from public, anon, authenticated;
revoke all on function public.google_reviews_search(text, smallint, text, timestamptz, timestamptz, boolean, integer, integer) from public, anon, authenticated;
revoke all on function public.google_review_audit_guard() from public, anon, authenticated;
revoke all on function public.google_reviews_check_location() from public, anon, authenticated;

grant execute on function public.google_review_claim_run(text, text) to service_role;
grant execute on function public.google_review_finish_run(uuid, text, jsonb, text, text) to service_role;
grant execute on function public.google_review_record_link(text, text, text, text, text, jsonb, text) to service_role;
grant execute on function public.google_review_apply_reviews(uuid, uuid, jsonb, boolean) to service_role;
grant execute on function public.google_review_note_location_failure(uuid, uuid, text) to service_role;
grant execute on function public.google_review_clear_link(text, text) to service_role;
grant execute on function public.google_review_set_connection(text, text[], text) to service_role;
grant execute on function public.google_review_end_connection(text, text, text) to service_role;
grant execute on function public.google_reviews_search(text, smallint, text, timestamptz, timestamptz, boolean, integer, integer) to service_role;

comment on table public.google_review_locations is
  'The allowlist of Buff City Soap stores whose Google reviews may be read. Seeded with exactly the seven approved Verified Business Profiles; reviews can only attach to these rows.';
comment on table public.google_reviews is
  'Google reviews for the approved stores. No reviewer identity is stored. A review is attached to its location by foreign key and its Google resource name is checked against that location''s own Google link.';
comment on column public.google_business_connections.refresh_token_sealed is
  'AES-256-GCM sealed by the application. The key is an environment variable and never reaches the database.';
