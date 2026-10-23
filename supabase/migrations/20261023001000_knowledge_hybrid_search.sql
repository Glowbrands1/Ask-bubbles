-- Keyword plus vector retrieval. Additive. match_knowledge_chunks is not replaced.
--
-- The embedding argument is extensions.vector with no width. The current
-- width stays the one declared in 20260831000800.
--
-- Rollback:
--   drop function if exists public.match_knowledge_chunks_hybrid(extensions.vector, text, text, integer, double precision, text[]);
--   drop index if exists public.knowledge_chunks_content_tsv_idx;
--   alter table public.knowledge_chunks drop column if exists content_tsv;

alter table public.knowledge_chunks
  add column if not exists content_tsv tsvector
  generated always as (
    to_tsvector('english', coalesce(content, '') || ' ' || coalesce(section, ''))
  ) stored;

create index if not exists knowledge_chunks_content_tsv_idx
  on public.knowledge_chunks using gin (content_tsv);

create or replace function public.match_knowledge_chunks_hybrid(
  query_embedding extensions.vector,
  query_text text,
  scope_id text,
  match_count integer default 20,
  min_similarity double precision default 0.0,
  filter_categories text[] default null
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
  vector_rank integer,
  keyword_rank integer,
  section_exact boolean
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with scoped as (
    select
      c.id as chunk_id,
      d.id as document_id,
      d.title as document_title,
      d.category as category,
      c.locator as locator,
      c.page as page,
      c.section as section,
      c.content as content,
      c.embedding,
      c.content_tsv,
      1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
    from public.knowledge_chunks c
    join public.knowledge_documents d on d.id = c.document_id
    where c.knowledge_scope_id = scope_id
      and d.indexed = true
      and d.status = 'indexed'
      and c.version = d.version
      and (filter_categories is null or d.category = any (filter_categories))
  ),
  ranked as (
    select
      scoped.*,
      row_number() over (order by scoped.embedding operator(extensions.<=>) query_embedding) as vector_rank,
      case
        when query_text is null or length(btrim(query_text)) = 0 then null
        else row_number() over (
          order by ts_rank(scoped.content_tsv, plainto_tsquery('english', query_text)) desc
        )
      end as keyword_rank,
      (
        scoped.section is not null
        and length(btrim(coalesce(query_text, ''))) > 0
        and scoped.section ilike '%' || query_text || '%'
      ) as section_exact
    from scoped
  )
  select
    chunk_id,
    document_id,
    document_title,
    category,
    locator,
    page,
    section,
    content,
    similarity,
    vector_rank::integer,
    keyword_rank::integer,
    section_exact
  from ranked
  where similarity >= min_similarity
     or (keyword_rank is not null and keyword_rank <= greatest(match_count, 1))
     or section_exact
  order by vector_rank
  limit greatest(match_count, 1) * 3;
$$;

revoke all on function public.match_knowledge_chunks_hybrid(
  extensions.vector, text, text, integer, double precision, text[]
) from public, anon, authenticated;

grant execute on function public.match_knowledge_chunks_hybrid(
  extensions.vector, text, text, integer, double precision, text[]
) to service_role;
