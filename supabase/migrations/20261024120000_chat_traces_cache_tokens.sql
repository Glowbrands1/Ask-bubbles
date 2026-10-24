-- Additive cache columns for chat_traces. Not applied from this branch.
-- chat_traces_live is select *, so these columns show up there on their own.
--
-- Rollback:
--   alter table public.chat_traces
--     drop column if exists cache_creation_input_tokens,
--     drop column if exists cache_read_input_tokens,
--     drop column if exists first_token_ms;

alter table public.chat_traces
  add column if not exists cache_creation_input_tokens integer,
  add column if not exists cache_read_input_tokens integer,
  add column if not exists first_token_ms integer;
