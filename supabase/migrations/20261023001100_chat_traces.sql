-- One row per chat turn when CHAT_TRACE_ENABLED is on. Service role only.
--
-- Rollback:
--   drop view if exists public.chat_traces_live;
--   drop table if exists public.chat_traces;

create table if not exists public.chat_traces (
  id uuid primary key default extensions.gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversation_id text,
  message_id text,
  user_id text,
  original_query text,
  rewritten_query text,
  intent text,
  retrieved jsonb not null default '[]'::jsonb,
  retrieval_count integer,
  prompt text,
  model text,
  max_tokens integer,
  stop_reason text,
  input_tokens integer,
  output_tokens integer,
  thinking_tokens integer,
  latency_ms integer,
  error_subtype text,
  error_class text,
  error_status integer,
  form_in_progress boolean not null default false,
  retryable boolean not null default false,
  retried boolean not null default false,
  succeeded boolean
);

alter table public.chat_traces enable row level security;
alter table public.chat_traces force row level security;
revoke all on public.chat_traces from anon, authenticated;

create or replace view public.chat_traces_live
with (security_invoker = true) as
select * from public.chat_traces
where created_at > now() - interval '7 days';

revoke all on public.chat_traces_live from anon, authenticated;
