-- Fuzzy section titles for RETRIEVAL_RECALL_ENABLED. Does not replace
-- match_knowledge_chunks. The argument is not a vector.
--
-- Rollback:
--   drop function if exists public.match_knowledge_sections_fuzzy(text, text, integer, double precision);

create extension if not exists pg_trgm with schema extensions;

create or replace function public.match_knowledge_sections_fuzzy(
  query_text text,
  scope_id text,
  match_count integer default 8,
  min_similarity double precision default 0.3
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  category text,
  locator text,
  page integer,
  section text,
  content text,
  similarity double precision,
  section_similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id as chunk_id,
    d.id as document_id,
    d.title as document_title,
    d.category as category,
    c.locator as locator,
    c.page as page,
    c.section as section,
    c.content as content,
    extensions.similarity(coalesce(c.section, ''), query_text) as similarity,
    extensions.similarity(coalesce(c.section, ''), query_text) as section_similarity
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id
  where c.knowledge_scope_id = scope_id
    and d.indexed = true
    and d.status = 'indexed'
    and c.version = d.version
    and c.section is not null
    and extensions.similarity(coalesce(c.section, ''), query_text) >= min_similarity
  order by section_similarity desc
  limit greatest(match_count, 1);
$$;

revoke all on function public.match_knowledge_sections_fuzzy(text, text, integer, double precision)
  from public, anon, authenticated;

grant execute on function public.match_knowledge_sections_fuzzy(text, text, integer, double precision)
  to service_role;
