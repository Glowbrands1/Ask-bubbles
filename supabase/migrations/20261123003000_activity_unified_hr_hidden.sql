-- ADMIN ANALYTICS: A FORM STILL WITH HR IS NOT COUNTED YET
--
-- Owner, 23 Nov 2026: "are u sure this doesnt leak information, that other people cant see what a certain manager
-- created?". While a form waits for HR (pending, sent back or rejected) only its creator, its senders and HR may know
-- it exists. `activity_unified` counted every form_instances row as `form_created` for its creator and store, so an
-- administrator's adoption figures rose by one the moment a manager sent a form, while the Forms Register showed
-- nothing new. A form now counts once HR approves it (or if it never went to HR), on the day it was created, as before.
--
-- The view is restated exactly as production holds it (read 23 Nov 2026, the same as 20260911001000), with one
-- `where` on the forms branch. Same columns, same order, same security_invoker; nothing else changes.
--
-- Not applied by the pull request: applied after merge.

create or replace view public.activity_unified
with (security_invoker = true) as
  select
    e.id as event_id,
    e.occurred_at,
    e.actor_user_id,
    e.actor_role,
    e.feature,
    e.category,
    e.location_id,
    e.succeeded,
    e.surface,
    e.turn_kind
  from public.activity_events e

  union all

  -- Filed forms. `created_by` is text, cast only when it is a uuid. A form still with HR is not counted yet.
  select
    null::uuid,
    i.created_at,
    case
      when i.created_by ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then i.created_by::uuid
    end,
    null::public.app_user_role,
    'forms'::public.activity_feature,
    'form_created'::public.activity_category,
    case when i.location_id ~ '^loc-[A-Za-z0-9-]{1,16}$' then i.location_id end,
    true,
    null::public.activity_surface,
    'not_applicable'::public.activity_turn_kind
  from public.form_instances i
  where i.hr_approval_state is null or i.hr_approval_state = 'approved'

  union all

  select
    null::uuid,
    d.created_at,
    d.uploaded_by,
    null::public.app_user_role,
    'knowledge'::public.activity_feature,
    'document_upload'::public.activity_category,
    null::text,
    true,
    null::public.activity_surface,
    'not_applicable'::public.activity_turn_kind
  from public.knowledge_documents d

  union all

  -- Report ingestion is machine work, so its actor is null by nature.
  select
    null::uuid,
    r.created_at,
    null::uuid,
    null::public.app_user_role,
    'reports'::public.activity_feature,
    'report_upload'::public.activity_category,
    null::text,
    r.status = 'succeeded',
    null::public.activity_surface,
    'not_applicable'::public.activity_turn_kind
  from public.report_ingestions r;

comment on view public.activity_unified is
  'Every recorded act in one shape: activity_events plus form_instances (not while with HR), knowledge_documents and report_ingestions read where they live.';

-- Restated: deny by default on top of a security_invoker view.
revoke all on public.activity_unified from anon, authenticated;
