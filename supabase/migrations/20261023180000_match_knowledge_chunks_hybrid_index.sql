-- Faster hybrid retrieval. Additive. match_knowledge_chunks is not replaced.
--
-- Replaces the body of match_knowledge_chunks_hybrid. Same arguments, same
-- columns. Does not edit 20261023001000 and does not change the embedding
-- column or the indexes.
--
-- The previous body materialized every visible chunk, then ranked that copy.
-- A materialized CTE has no HNSW index and no GIN index, so both legs scanned
-- the whole scope.
--
-- This body asks the base table for a small candidate set:
--   * vector: ORDER BY embedding <=> query LIMIT, visibility in WHERE, so the
--     HNSW index can return the nearest rows. The limit is wider than the
--     caller asked for, because a function-level hnsw.iterative_scan setting
--     is not used (the database rejects it). The extra rows cover neighbours
--     the visibility filter drops before the rank limit is applied.
--   * keyword: content_tsv @@ an OR tsquery of the significant words
--     (websearch_to_tsquery, words joined by OR), so the GIN index is used
--     and one missing word does not throw the whole question away.
--   * the final select joins only those candidate ids.
--
-- statement_timeout is 6s on the function. The app gives up sooner and uses
-- match_knowledge_chunks.
--
-- Rollback: the commented statements below are the function body from
-- 20261023001000_knowledge_hybrid_search.sql. Copy them, remove the leading
-- comment marks, and run them to put that body back. The content_tsv column
-- and its GIN index stay.

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
set statement_timeout = '6s'
as $$
  with keyword_query as (
    select case
      when coalesce(btrim(words), '') = '' then null::tsquery
      else nullif(websearch_to_tsquery('english', words), ''::tsquery)
    end as tsq
    from (
      select string_agg(word, ' OR ' order by word) as words
      from (
        select distinct word
        from regexp_split_to_table(lower(coalesce(query_text, '')), '[^a-z0-9]+') as word
        where char_length(word) >= 3
          and word !~ '^[0-9]+$'
      ) significant
    ) joined
  ),
  vector_hits as (
    select ranked.id, ranked.similarity, ranked.vector_rank::integer as vector_rank
    from (
      select
        nearest.id,
        nearest.similarity,
        row_number() over (order by nearest.similarity desc) as vector_rank
      from (
        select
          c.id,
          1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
        from public.knowledge_chunks c
        where c.knowledge_scope_id = scope_id
          and exists (
            select 1
            from public.knowledge_documents d
            where d.id = c.document_id
              and d.indexed = true
              and d.status = 'indexed'
              and d.version = c.version
              and (filter_categories is null or d.category = any (filter_categories))
          )
        order by c.embedding operator(extensions.<=>) query_embedding
        limit least(400, greatest(8, least(match_count, 50)) * 8)
      ) nearest
      where nearest.similarity >= min_similarity
    ) ranked
    where ranked.vector_rank <= greatest(1, least(match_count, 50))
  ),
  keyword_hits as (
    select
      ranked.id,
      row_number() over (order by ranked.rank desc) as keyword_rank
    from (
      select
        c.id,
        ts_rank_cd(c.content_tsv, (select keyword_query.tsq from keyword_query)) as rank
      from public.knowledge_chunks c
      where (select keyword_query.tsq from keyword_query) is not null
        and c.knowledge_scope_id = scope_id
        and c.content_tsv @@ (select keyword_query.tsq from keyword_query)
        and exists (
          select 1
          from public.knowledge_documents d
          where d.id = c.document_id
            and d.indexed = true
            and d.status = 'indexed'
            and d.version = c.version
            and (filter_categories is null or d.category = any (filter_categories))
        )
      order by ts_rank_cd(c.content_tsv, (select keyword_query.tsq from keyword_query)) desc
      limit greatest(1, least(match_count, 50))
    ) ranked
  ),
  candidates as (
    select vector_hits.id from vector_hits
    union
    select keyword_hits.id from keyword_hits
  )
  select
    c.id as chunk_id,
    c.document_id,
    d.title as document_title,
    d.category,
    c.locator,
    c.page,
    c.section,
    c.content,
    coalesce(
      v.similarity,
      1 - (c.embedding operator(extensions.<=>) query_embedding)
    ) as similarity,
    v.vector_rank,
    k.keyword_rank::integer,
    (
      c.section is not null
      and char_length(btrim(c.section)) >= 4
      and strpos(lower(coalesce(query_text, '')), lower(btrim(c.section))) > 0
    ) as section_exact
  from candidates ids
  join public.knowledge_chunks c
    on c.id = ids.id
  join public.knowledge_documents d
    on d.id = c.document_id
  left join vector_hits v
    on v.id = c.id
  left join keyword_hits k
    on k.id = c.id
  where c.knowledge_scope_id = scope_id
    and d.indexed = true
    and d.status = 'indexed'
    and c.version = d.version
    and (filter_categories is null or d.category = any (filter_categories));
$$;

comment on function public.match_knowledge_chunks_hybrid(
  extensions.vector, text, text, integer, double precision, text[]
) is
  'Keyword OR-query and vector candidates for one scope, read through the HNSW and GIN indexes, plus an exact section-title flag on those candidates. The app fuses the ranks. Does not replace match_knowledge_chunks.';

revoke all on function public.match_knowledge_chunks_hybrid(
  extensions.vector, text, text, integer, double precision, text[]
) from public, anon, authenticated;

grant execute on function public.match_knowledge_chunks_hybrid(
  extensions.vector, text, text, integer, double precision, text[]
) to service_role;

-- ---------------------------------------------------------------------------
-- Rollback copy. Not applied. Leading marks make these comments.
-- ---------------------------------------------------------------------------
-- create or replace function public.match_knowledge_chunks_hybrid(
--   query_embedding extensions.vector,
--   query_text text,
--   scope_id text,
--   match_count integer default 20,
--   min_similarity double precision default 0.0,
--   filter_categories text[] default null
-- )
-- returns table (
--   chunk_id uuid,
--   document_id uuid,
--   document_title text,
--   category text,
--   locator text,
--   page integer,
--   section text,
--   content text,
--   similarity double precision,
--   vector_rank integer,
--   keyword_rank integer,
--   section_exact boolean
-- )
-- language sql
-- stable
-- security invoker
-- set search_path = public, extensions
-- as $$
--   with scoped as (
--     select
--       c.id as chunk_id,
--       d.id as document_id,
--       d.title as document_title,
--       d.category as category,
--       c.locator as locator,
--       c.page as page,
--       c.section as section,
--       c.content as content,
--       c.embedding,
--       c.content_tsv,
--       1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
--     from public.knowledge_chunks c
--     join public.knowledge_documents d on d.id = c.document_id
--     where c.knowledge_scope_id = scope_id
--       and d.indexed = true
--       and d.status = 'indexed'
--       and c.version = d.version
--       and (filter_categories is null or d.category = any (filter_categories))
--   ),
--   ranked as (
--     select
--       scoped.*,
--       row_number() over (order by scoped.embedding operator(extensions.<=>) query_embedding) as vector_rank,
--       case
--         when query_text is null or length(btrim(query_text)) = 0 then null
--         else row_number() over (
--           order by ts_rank(scoped.content_tsv, plainto_tsquery('english', query_text)) desc
--         )
--       end as keyword_rank,
--       (
--         scoped.section is not null
--         and length(btrim(coalesce(query_text, ''))) > 0
--         and scoped.section ilike '%' || query_text || '%'
--       ) as section_exact
--     from scoped
--   )
--   select
--     chunk_id,
--     document_id,
--     document_title,
--     category,
--     locator,
--     page,
--     section,
--     content,
--     similarity,
--     vector_rank::integer,
--     keyword_rank::integer,
--     section_exact
--   from ranked
--   where similarity >= min_similarity
--      or (keyword_rank is not null and keyword_rank <= greatest(match_count, 1))
--      or section_exact
--   order by vector_rank
--   limit greatest(match_count, 1) * 3;
-- $$;
--
-- revoke all on function public.match_knowledge_chunks_hybrid(
--   extensions.vector, text, text, integer, double precision, text[]
-- ) from public, anon, authenticated;
--
-- grant execute on function public.match_knowledge_chunks_hybrid(
--   extensions.vector, text, text, integer, double precision, text[]
-- ) to service_role;
