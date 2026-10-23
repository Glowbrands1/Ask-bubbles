-- Form fields already established in one conversation. Service role only.
-- Read before a question is asked, and only when SLOT_RETENTION_ENABLED is on.
--
-- Rollback:
--   drop table if exists public.chat_form_state;

create table if not exists public.chat_form_state (
  user_id text not null,
  conversation_id text not null,
  fields jsonb not null default '{}'::jsonb,
  incident_key text,
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.chat_form_state enable row level security;
alter table public.chat_form_state force row level security;
revoke all on public.chat_form_state from anon, authenticated;
