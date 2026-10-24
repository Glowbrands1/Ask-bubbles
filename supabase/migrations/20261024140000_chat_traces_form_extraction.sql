-- The form extraction on a chat turn: model, token counts, and the slots
-- that were kept. Not applied from this branch until migrations run.
--
-- A view's select list is fixed when the view is created, so adding columns
-- to chat_traces does not change chat_traces_live. The view is recreated
-- below with the same predicate and security_invoker.
--
-- Rollback: drop the view first.
--   drop view if exists public.chat_traces_live;
--   alter table public.chat_traces
--     drop column if exists extraction_model,
--     drop column if exists extraction_input_tokens,
--     drop column if exists extraction_output_tokens,
--     drop column if exists slots;
--   create or replace view public.chat_traces_live
--   with (security_invoker = true) as
--   select * from public.chat_traces
--   where created_at > now() - interval '7 days';
--   revoke all on public.chat_traces_live from anon, authenticated;

alter table public.chat_traces
  add column if not exists extraction_model text,
  add column if not exists extraction_input_tokens integer,
  add column if not exists extraction_output_tokens integer,
  add column if not exists slots jsonb;

create or replace view public.chat_traces_live
with (security_invoker = true) as
select * from public.chat_traces
where created_at > now() - interval '7 days';

revoke all on public.chat_traces_live from anon, authenticated;
