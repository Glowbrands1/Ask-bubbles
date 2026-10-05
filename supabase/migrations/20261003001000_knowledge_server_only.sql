-- ============================================================================
-- KNOWLEDGE IS SERVER-ONLY, LIKE EVERYTHING ELSE.
-- ============================================================================
--
-- Ask Bubbles' browser uses Supabase for authentication only. Every knowledge
-- read — retrieval, citation, the source viewer, downloads — goes through a
-- server route that applies the application's permission checks (for
-- example, which original files only an administrator may download) and uses
-- the secret key.
--
-- The policies inherited from the reference platform let any active
-- signed-in account select every non-retired document and chunk directly with
-- the publishable key and its own JWT. Nothing in this product uses that
-- path, and it would bypass the server's document restrictions, so it is
-- closed: no browser grant, no browser policy, RLS still enabled and forced.
--
-- Also tidied here: trigger and helper functions that Postgres grants to
-- PUBLIC by default are revoked from the browser roles, so the only function
-- a browser-held key can execute is `accept_invitation()`.

drop policy if exists knowledge_documents_read_authenticated on public.knowledge_documents;
drop policy if exists knowledge_chunks_read_authenticated    on public.knowledge_chunks;

revoke all on public.knowledge_documents from anon, authenticated;
revoke all on public.knowledge_chunks    from anon, authenticated;

revoke all on function public.touch_updated_at() from public, anon, authenticated;

do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'match_knowledge_chunks'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end
$$;

-- `anon` never has a session, so it has no business holding SELECT on the
-- profile table even though RLS would return nothing.
revoke all on public.app_users from anon;
