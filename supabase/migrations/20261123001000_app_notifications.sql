-- ---------------------------------------------------------------------------
-- IN-APP NOTIFICATIONS — the bell.
--
-- Port from the sibling app (30cac4c, 20261120002000_app_notifications.sql): the same
-- table, so both apps' bells and the HR form approval that writes to them
-- (Pau, 23 Nov 2026) share one shape. The sibling's is dated 20 Nov; this one
-- is dated 23 Nov because 20261120002000 is already taken here
-- (forms_overview_unaccent).
--
-- ADDITIVE ONLY. One new table; nothing existing is read, rewritten or dropped.
--
-- Addressed by EMAIL, the identity the app already matches its allow-lists on,
-- so a notification can be written for someone before they have ever signed in.
--
-- RLS IS ENABLED WITH NO POLICIES: a browser client reads zero rows. Every read
-- and write runs on the server under the secret key, scoped to the signed-in
-- caller's own email (`src/lib/notifications/repository.ts`).
-- ---------------------------------------------------------------------------

create table public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null
    check (recipient_email = lower(btrim(recipient_email)) and position('@' in recipient_email) > 1),
  -- What raised it, e.g. 'form_approval_requested'.
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{0,59}$'),
  title text not null check (length(btrim(title)) between 1 and 300),
  body text not null default '' check (length(body) <= 2000),
  -- An in-app path only ("/forms/monitoring"), never another site.
  href text check (href is null or href ~ '^/[^/\\]'),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index app_notifications_recipient_idx
  on public.app_notifications (recipient_email, created_at desc);
create index app_notifications_unread_idx
  on public.app_notifications (recipient_email)
  where read_at is null;

alter table public.app_notifications enable row level security;
alter table public.app_notifications force row level security;

revoke all on public.app_notifications from anon, authenticated;
grant all on public.app_notifications to service_role;
