-- Notes a manager asked the assistant to keep. Service role only.
-- kind is store, employee, or preference. A salon is stored as a store.
--
-- Rollback:
--   drop table if exists public.user_memory;

create table if not exists public.user_memory (
  user_id text not null,
  kind text not null check (kind in ('store', 'employee', 'preference')),
  key text not null,
  value text not null,
  source_conversation_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);

alter table public.user_memory enable row level security;
alter table public.user_memory force row level security;
revoke all on public.user_memory from anon, authenticated;
