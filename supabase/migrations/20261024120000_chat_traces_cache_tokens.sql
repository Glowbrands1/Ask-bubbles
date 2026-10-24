-- Additive cache columns for chat_traces. Not applied from this branch.
-- A view's select list is fixed when the view is created, so adding columns
-- to chat_traces does not change chat_traces_live. The view is recreated
-- below with the same predicate and security_invoker. create or replace
-- expands * after the columns exist, and it only adds columns at the end.
--
-- Rollback: drop the view first. Dropping the columns while
-- chat_traces_live still selects them fails with
-- "cannot drop column ... other objects depend on it".
--   drop view if exists public.chat_traces_live;
--   alter table public.chat_traces
--     drop column if exists cache_creation_input_tokens,
--     drop column if exists cache_read_input_tokens,
--     drop column if exists first_token_ms;
--   create or replace view public.chat_traces_live
--   with (security_invoker = true) as
--   select * from public.chat_traces
--   where created_at > now() - interval '7 days';
--   revoke all on public.chat_traces_live from anon, authenticated;

alter table public.chat_traces
  add column if not exists cache_creation_input_tokens integer,
  add column if not exists cache_read_input_tokens integer,
  add column if not exists first_token_ms integer;

create or replace view public.chat_traces_live
with (security_invoker = true) as
select * from public.chat_traces
where created_at > now() - interval '7 days';

revoke all on public.chat_traces_live from anon, authenticated;
