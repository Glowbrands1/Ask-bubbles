-- Anthropic prompt-cache usage on chat_traces.
-- Written only when CHAT_TRACE_ENABLED is on.
-- The values are usage.cache_creation_input_tokens and
-- usage.cache_read_input_tokens. They are not estimated.
--
-- Rollback:
--   drop view if exists public.chat_traces_live;
--   alter table public.chat_traces
--     drop column if exists cache_creation_input_tokens,
--     drop column if exists cache_read_input_tokens;
--   create or replace view public.chat_traces_live
--   with (security_invoker = true) as
--   select * from public.chat_traces
--   where created_at > now() - interval '7 days';
--   revoke all on public.chat_traces_live from anon, authenticated;

alter table public.chat_traces
  add column if not exists cache_creation_input_tokens integer,
  add column if exists cache_read_input_tokens integer;

create or replace view public.chat_traces_live
with (security_invoker = true) as
select
  id,
  created_at,
  conversation_id,
  message_id,
  user_id,
  original_query,
  rewritten_query,
  intent,
  retrieved,
  retrieval_count,
  prompt,
  model,
  max_tokens,
  stop_reason,
  input_tokens,
  output_tokens,
  thinking_tokens,
  latency_ms,
  error_subtype,
  error_class,
  error_status,
  form_in_progress,
  retryable,
  retried,
  succeeded,
  cache_creation_input_tokens,
  cache_read_input_tokens
from public.chat_traces
where created_at > now() - interval '7 days';

revoke all on public.chat_traces_live from anon, authenticated;
