-- Weekly chat-trace review. Not a migration. Run by hand when
-- CHAT_TRACE_ENABLED has been writing rows.
-- rewritten_query, retrieval_count, and turns that did not open a form.

select
  date_trunc('week', created_at) as week,
  count(*) as turns,
  count(*) filter (where rewritten_query is not null) as rewritten,
  count(*) filter (where retrieval_count = 0) as no_retrieval,
  count(*) filter (where form_in_progress = false) as no_form_turns
from public.chat_traces
where created_at > now() - interval '7 days'
group by 1
order by 1;
