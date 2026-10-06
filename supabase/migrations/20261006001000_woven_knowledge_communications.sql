-- ---------------------------------------------------------------------------
-- Woven knowledge sync: Buff City Soap's Communications content type.
-- ---------------------------------------------------------------------------
--
-- WHY. The Buff City Soap Woven company holds Communications (newsletters,
-- Monthly Pour decks) as a knowledge source. The Buff City Soap connector
-- inventories them, so the manifest, the audit log and the dry-run inventory
-- must accept the content type `communication`.
--
-- WHAT THIS CHANGES: the `content_type` CHECK on three knowledge_sync_* tables
-- is widened by one value. Each constraint is replaced inside this migration's
-- transaction, so there is no moment without one.
--
-- ADDITIVE ONLY. No column, row, grant or policy is dropped or changed; every
-- existing row satisfies the wider check; re-running it is a no-op.
-- ---------------------------------------------------------------------------

alter table public.knowledge_sync_items
  drop constraint if exists knowledge_sync_items_content_type_check;
alter table public.knowledge_sync_items
  add constraint knowledge_sync_items_content_type_check check (content_type in (
    'policy', 'handbook', 'procedure', 'file_library', 'knowledge_element', 'course', 'communication'
  ));

alter table public.knowledge_sync_events
  drop constraint if exists knowledge_sync_events_content_type_check;
alter table public.knowledge_sync_events
  add constraint knowledge_sync_events_content_type_check check (content_type in (
    'policy', 'handbook', 'procedure', 'file_library', 'knowledge_element', 'course', 'communication'
  ));

alter table public.knowledge_sync_preview_items
  drop constraint if exists knowledge_sync_preview_items_content_type_check;
alter table public.knowledge_sync_preview_items
  add constraint knowledge_sync_preview_items_content_type_check check (content_type in (
    'policy', 'handbook', 'procedure', 'file_library', 'knowledge_element', 'course', 'communication'
  ));
