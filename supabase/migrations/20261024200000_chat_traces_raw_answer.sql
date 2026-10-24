-- The model's raw answer on chat_traces. Not applied from this branch.
-- The saved chat message keeps the text after citation checks and marker stripping.
-- raw_answer is the answer call's text before any of that, so a citation bug
-- can be replayed from what the model wrote. Capped at 20,000 characters by
-- the writer. Nullable, appended after the existing columns.
--
-- Written only when CHAT_TRACE_ENABLED and CHAT_TRACE_RAW_ANSWER_ENABLED are
-- both on. With the second flag off the insert does not name this column, so
-- the app works before this file is applied.
--
-- A view's select list is fixed when the view is created, so adding a column
-- to chat_traces does not change chat_traces_live. The view is recreated
-- below with the same predicate and security_invoker. create or replace
-- expands * after the column exists, and it only adds columns at the end.
--
-- Rollback: drop the view first.
--   drop view if exists public.chat_traces_live;
--   alter table public.chat_traces drop column if exists raw_answer;
--   create or replace view public.chat_traces_live
--   with (security_invoker = true) as
--   select * from public.chat_traces
--   where created_at > now() - interval '7 days';
--   revoke all on public.chat_traces_live from anon, authenticated;

alter table public.chat_traces
  add column if not exists raw_answer text;

comment on column public.chat_traces.raw_answer is
  'The answer call''s text as the model returned it, before citation checks or post-processing. First 20,000 characters. Null unless CHAT_TRACE_RAW_ANSWER_ENABLED was on for the turn.';

create or replace view public.chat_traces_live
with (security_invoker = true) as
select * from public.chat_traces
where created_at > now() - interval '7 days';

revoke all on public.chat_traces_live from anon, authenticated;
