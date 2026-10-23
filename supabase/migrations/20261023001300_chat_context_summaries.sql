-- Stored summary of older chat turns. Read only when LONG_CONTEXT_ENABLED is on.
--
-- Rollback:
--   drop table if exists public.chat_context_summaries;

create table if not exists public.chat_context_summaries (
  user_id text not null,
  conversation_id text not null,
  summary text not null,
  through_message_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.chat_context_summaries enable row level security;
alter table public.chat_context_summaries force row level security;
revoke all on public.chat_context_summaries from anon, authenticated;
