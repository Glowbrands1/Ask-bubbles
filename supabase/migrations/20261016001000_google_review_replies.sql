-- GOOGLE REVIEW REPLIES — drafts, manual publishing and status tracking for owner replies.
--
-- ADDITIVE ONLY. Two new tables and eight functions. Nothing in `google_reviews`,
-- `google_review_locations` or any existing function is altered or dropped; no existing
-- row is touched by applying this migration. Rollback: supabase/rollbacks/20261016001000_google_review_replies_down.sql
--
-- LIFECYCLE OF ONE REPLY            (a review has AT MOST ONE open reply at a time)
--
--     draft ──publish──▶ publishing ──Google accepts──▶ published   (terminal)
--       ▲                    │
--       │                    └──Google refuses / unknown──▶ failed ──edit or retry──▶ draft / publishing
--       └── discard ──▶ discarded (terminal; from draft or failed only)
--
--   * "Open" = draft, publishing or failed. A partial unique index allows only one open reply per
--     review, so two people cannot publish two replies to the same review, and a double click cannot
--     start two publishes: the second claim finds the row already `publishing` and is refused.
--   * `version` counts REVISIONS OF THE TEXT (it increments only when the body is saved). A publish names
--     the version the person confirmed; if the draft was edited meanwhile the claim is refused
--     (`reply_conflict`) and nothing is sent. Status changes never change the version.
--   * `base_reply_comment` is the owner reply on file when the draft was started. A reply that changed
--     on Google since then is detected by the application before it publishes.
--   * Publishing a reply updates `google_reviews.reply_comment` / `reply_update_time` only. It does NOT
--     touch `content_hash`, so a sync that reads Google before the change propagates is a no-op (hash
--     still equal), and the first sync after it propagates records Google's own values.
--
-- Who may do this is decided by the application (permission + the salons in the person's assignment);
-- every function below is callable by the server-side secret key only and re-checks the row state it
-- depends on inside its own transaction. Reply text is never written to the event log: lengths only.

create table if not exists public.google_review_replies (
  id uuid primary key default extensions.gen_random_uuid(),
  review_id uuid not null references public.google_reviews (id) on delete restrict,
  location_id uuid not null references public.google_review_locations (id) on delete restrict,
  kind text not null check (kind in ('new', 'edit')),
  status text not null check (status in ('draft', 'publishing', 'published', 'failed', 'discarded')),
  /* Google's limit is 4096 bytes. */
  body text not null check (octet_length(body) <= 4096 and length(btrim(body)) >= 1),
  base_reply_comment text,
  version integer not null default 1 check (version >= 1),
  attempts integer not null default 0 check (attempts >= 0),
  created_by text not null check (length(created_by) between 1 and 200),
  updated_by text not null check (length(updated_by) between 1 and 200),
  publish_requested_by text check (publish_requested_by is null or length(publish_requested_by) <= 200),
  publish_started_at timestamptz,
  published_by text check (published_by is null or length(published_by) <= 200),
  published_at timestamptz,
  google_reply_update_time timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z_]{1,64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists google_review_replies_one_open
  on public.google_review_replies (review_id)
  where status in ('draft', 'publishing', 'failed');
create index if not exists google_review_replies_status
  on public.google_review_replies (status, updated_at desc);
create index if not exists google_review_replies_review
  on public.google_review_replies (review_id, created_at desc);

drop trigger if exists google_review_replies_touch on public.google_review_replies;
create trigger google_review_replies_touch
  before update on public.google_review_replies
  for each row execute function public.touch_updated_at();

create table if not exists public.google_review_reply_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  reply_id uuid not null references public.google_review_replies (id) on delete restrict,
  review_id uuid not null,
  actor text not null check (length(actor) between 1 and 200),
  event text not null check (event in (
    'draft_created', 'draft_edited', 'draft_discarded',
    'publish_started', 'published', 'publish_failed', 'publish_reconciled', 'publish_outcome_unknown'
  )),
  /* Codes, versions and lengths only. Never reply text, review text or a reviewer. */
  detail jsonb not null default '{}'::jsonb
);

create index if not exists google_review_reply_events_reply on public.google_review_reply_events (reply_id, id);

create or replace function public.google_review_reply_events_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'google_review_reply_events is append-only' using errcode = 'check_violation';
end;
$$;

drop trigger if exists google_review_reply_events_no_change on public.google_review_reply_events;
create trigger google_review_reply_events_no_change
  before update or delete on public.google_review_reply_events
  for each row execute function public.google_review_reply_events_guard();

-- ------------------------------------------------------------ functions ---

create or replace function public.google_review_reply_json(r public.google_review_replies)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'review_id', r.review_id, 'kind', r.kind, 'status', r.status, 'body', r.body,
    'base_reply_comment', r.base_reply_comment, 'version', r.version, 'attempts', r.attempts,
    'created_by', r.created_by, 'updated_by', r.updated_by, 'updated_at', r.updated_at,
    'published_by', r.published_by, 'published_at', r.published_at,
    'last_error_code', r.last_error_code, 'publish_started_at', r.publish_started_at
  );
$$;

/* Everything the application needs to authorize and act on one review: its salon, Google resource name, current reply and open reply. */
create or replace function public.google_review_reply_context(p_review uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_review public.google_reviews%rowtype;
  v_store text;
  v_open public.google_review_replies%rowtype;
begin
  select * into v_review from public.google_reviews where id = p_review;
  if not found then return null; end if;
  select l.store_code into v_store from public.google_review_locations l where l.id = v_review.location_id;
  select * into v_open from public.google_review_replies
   where review_id = p_review and status in ('draft', 'publishing', 'failed');
  return jsonb_build_object(
    'review_id', v_review.id, 'location_id', v_review.location_id, 'store_code', v_store,
    'resource_name', v_review.review_resource_name, 'reply_comment', v_review.reply_comment,
    'removed_at', v_review.removed_at,
    'open_reply', case when v_open.id is null then null else public.google_review_reply_json(v_open) end
  );
end;
$$;

/* The open reply (draft / publishing / failed) of each listed review, for the dashboard. */
create or replace function public.google_review_replies_open(p_review_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.google_review_reply_json(r)), '[]'::jsonb)
    from public.google_review_replies r
   where r.review_id = any (p_review_ids) and r.status in ('draft', 'publishing', 'failed');
$$;

create or replace function public.google_review_reply_save_draft(
  p_review uuid, p_body text, p_actor text, p_expected_version integer default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.google_reviews%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_open public.google_review_replies%rowtype;
begin
  if length(v_body) = 0 then raise exception 'reply_empty' using errcode = 'invalid_parameter_value'; end if;
  if octet_length(v_body) > 4096 then raise exception 'reply_too_long' using errcode = 'invalid_parameter_value'; end if;

  select * into v_review from public.google_reviews where id = p_review for update;
  if not found or v_review.removed_at is not null then
    raise exception 'review_unavailable' using errcode = 'check_violation';
  end if;
  if v_review.reply_comment is not null and v_body = v_review.reply_comment then
    raise exception 'reply_unchanged' using errcode = 'check_violation';
  end if;

  select * into v_open from public.google_review_replies
   where review_id = p_review and status in ('draft', 'publishing', 'failed') for update;

  if not found then
    insert into public.google_review_replies (review_id, location_id, kind, status, body, base_reply_comment, created_by, updated_by)
    values (p_review, v_review.location_id, case when v_review.reply_comment is null then 'new' else 'edit' end,
            'draft', v_body, v_review.reply_comment, left(p_actor, 200), left(p_actor, 200))
    returning * into v_open;
    insert into public.google_review_reply_events (reply_id, review_id, actor, event, detail)
    values (v_open.id, p_review, left(p_actor, 200), 'draft_created', jsonb_build_object('kind', v_open.kind, 'length', length(v_body)));
  else
    if v_open.status = 'publishing' then raise exception 'reply_busy' using errcode = 'check_violation'; end if;
    if p_expected_version is not null and p_expected_version <> v_open.version then
      raise exception 'reply_conflict' using errcode = 'check_violation';
    end if;
    update public.google_review_replies
       set body = v_body, status = 'draft', version = version + 1, last_error_code = null, updated_by = left(p_actor, 200)
     where id = v_open.id returning * into v_open;
    insert into public.google_review_reply_events (reply_id, review_id, actor, event, detail)
    values (v_open.id, p_review, left(p_actor, 200), 'draft_edited', jsonb_build_object('version', v_open.version, 'length', length(v_body)));
  end if;
  return public.google_review_reply_json(v_open);
end;
$$;

/* Move a draft/failed reply to `publishing`, once. The version must be the one the person confirmed. */
create or replace function public.google_review_reply_claim_publish(p_reply uuid, p_version integer, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reply public.google_review_replies%rowtype;
  v_removed timestamptz;
begin
  select * into v_reply from public.google_review_replies where id = p_reply for update;
  if not found then raise exception 'reply_missing' using errcode = 'no_data_found'; end if;
  if v_reply.status = 'publishing' then raise exception 'reply_busy' using errcode = 'check_violation'; end if;
  if v_reply.status in ('published', 'discarded') then raise exception 'reply_closed' using errcode = 'check_violation'; end if;
  if v_reply.version <> p_version then raise exception 'reply_conflict' using errcode = 'check_violation'; end if;
  select removed_at into v_removed from public.google_reviews where id = v_reply.review_id;
  if v_removed is not null then raise exception 'review_unavailable' using errcode = 'check_violation'; end if;

  update public.google_review_replies
     set status = 'publishing', attempts = attempts + 1, publish_requested_by = left(p_actor, 200),
         publish_started_at = now(), last_error_code = null
   where id = p_reply returning * into v_reply;
  insert into public.google_review_reply_events (reply_id, review_id, actor, event, detail)
  values (v_reply.id, v_reply.review_id, left(p_actor, 200), 'publish_started', jsonb_build_object('attempt', v_reply.attempts, 'kind', v_reply.kind));
  return public.google_review_reply_json(v_reply);
end;
$$;

/*
 * A `publishing` row older than the window means the process died, or the answer never came back, after the
 * request may have reached Google. It becomes `failed` with `outcome_unknown`; the next publish compares with
 * what Google actually holds before sending anything.
 */
create or replace function public.google_review_reply_release_stuck(p_reply uuid, p_actor text, p_older_than interval default interval '2 minutes')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_reply public.google_review_replies%rowtype;
begin
  update public.google_review_replies
     set status = 'failed', last_error_code = 'outcome_unknown'
   where id = p_reply and status = 'publishing' and publish_started_at < now() - p_older_than
   returning * into v_reply;
  if not found then return false; end if;
  insert into public.google_review_reply_events (reply_id, review_id, actor, event, detail)
  values (v_reply.id, v_reply.review_id, left(p_actor, 200), 'publish_outcome_unknown', '{}'::jsonb);
  return true;
end;
$$;

/* Google accepted the reply (or already holds exactly this text). Records it on the reply AND on the review row. */
create or replace function public.google_review_reply_mark_published(
  p_reply uuid, p_comment text, p_update_time timestamptz, p_actor text, p_reconciled boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_reply public.google_review_replies%rowtype;
begin
  select * into v_reply from public.google_review_replies where id = p_reply for update;
  if not found then raise exception 'reply_missing' using errcode = 'no_data_found'; end if;
  if v_reply.status <> 'publishing' and not (p_reconciled and v_reply.status in ('failed', 'draft')) then
    raise exception 'reply_not_publishing' using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_comment, ''))) = 0 then raise exception 'reply_empty' using errcode = 'invalid_parameter_value'; end if;

  update public.google_review_replies
     set status = 'published', published_by = left(p_actor, 200), published_at = now(),
         google_reply_update_time = coalesce(p_update_time, now()), last_error_code = null
   where id = p_reply returning * into v_reply;
  update public.google_reviews
     set reply_comment = p_comment, reply_update_time = coalesce(p_update_time, now()), last_changed_at = now()
   where id = v_reply.review_id;
  insert into public.google_review_reply_events (reply_id, review_id, actor, event, detail)
  values (v_reply.id, v_reply.review_id, left(p_actor, 200), case when p_reconciled then 'publish_reconciled' else 'published' end,
          jsonb_build_object('kind', v_reply.kind, 'length', length(p_comment)));
  return public.google_review_reply_json(v_reply);
end;
$$;

create or replace function public.google_review_reply_mark_failed(p_reply uuid, p_code text, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_reply public.google_review_replies%rowtype;
begin
  if p_code is null or p_code !~ '^[a-z_]{1,64}$' then raise exception 'bad_code' using errcode = 'invalid_parameter_value'; end if;
  update public.google_review_replies
     set status = 'failed', last_error_code = p_code
   where id = p_reply and status = 'publishing' returning * into v_reply;
  if not found then raise exception 'reply_not_publishing' using errcode = 'check_violation'; end if;
  insert into public.google_review_reply_events (reply_id, review_id, actor, event, detail)
  values (v_reply.id, v_reply.review_id, left(p_actor, 200), 'publish_failed', jsonb_build_object('code', p_code, 'attempt', v_reply.attempts));
  return public.google_review_reply_json(v_reply);
end;
$$;

create or replace function public.google_review_reply_discard(p_reply uuid, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_reply public.google_review_replies%rowtype;
begin
  select * into v_reply from public.google_review_replies where id = p_reply for update;
  if not found then raise exception 'reply_missing' using errcode = 'no_data_found'; end if;
  if v_reply.status = 'publishing' then raise exception 'reply_busy' using errcode = 'check_violation'; end if;
  if v_reply.status in ('published', 'discarded') then raise exception 'reply_closed' using errcode = 'check_violation'; end if;
  update public.google_review_replies set status = 'discarded', updated_by = left(p_actor, 200)
   where id = p_reply returning * into v_reply;
  insert into public.google_review_reply_events (reply_id, review_id, actor, event, detail)
  values (v_reply.id, v_reply.review_id, left(p_actor, 200), 'draft_discarded', '{}'::jsonb);
  return public.google_review_reply_json(v_reply);
end;
$$;

-- ---------------------------------------------------------------- access ---

alter table public.google_review_replies enable row level security;
alter table public.google_review_reply_events enable row level security;
revoke all on public.google_review_replies from anon, authenticated;
revoke all on public.google_review_reply_events from anon, authenticated;
revoke all on sequence public.google_review_reply_events_id_seq from anon, authenticated;

revoke all on function public.google_review_reply_events_guard() from public, anon, authenticated;
revoke all on function public.google_review_reply_json(public.google_review_replies) from public, anon, authenticated;
revoke all on function public.google_review_reply_context(uuid) from public, anon, authenticated;
revoke all on function public.google_review_replies_open(uuid[]) from public, anon, authenticated;
revoke all on function public.google_review_reply_save_draft(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.google_review_reply_claim_publish(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.google_review_reply_release_stuck(uuid, text, interval) from public, anon, authenticated;
revoke all on function public.google_review_reply_mark_published(uuid, text, timestamptz, text, boolean) from public, anon, authenticated;
revoke all on function public.google_review_reply_mark_failed(uuid, text, text) from public, anon, authenticated;
revoke all on function public.google_review_reply_discard(uuid, text) from public, anon, authenticated;

grant execute on function public.google_review_reply_context(uuid) to service_role;
grant execute on function public.google_review_replies_open(uuid[]) to service_role;
grant execute on function public.google_review_reply_save_draft(uuid, text, text, integer) to service_role;
grant execute on function public.google_review_reply_claim_publish(uuid, integer, text) to service_role;
grant execute on function public.google_review_reply_release_stuck(uuid, text, interval) to service_role;
grant execute on function public.google_review_reply_mark_published(uuid, text, timestamptz, text, boolean) to service_role;
grant execute on function public.google_review_reply_mark_failed(uuid, text, text) to service_role;
grant execute on function public.google_review_reply_discard(uuid, text) to service_role;

comment on table public.google_review_replies is
  'Owner-reply drafts and their publishing status, one open reply per review. Written only by the SECURITY DEFINER functions; reply text lives here and nowhere in the event log.';
