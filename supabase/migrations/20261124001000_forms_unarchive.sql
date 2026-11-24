-- ---------------------------------------------------------------------------
-- NO ARCHIVED FORMS (Pau, 23 Nov 2026): "the archived should not be
-- acknowledged as a form, all just should be finalized or drafted."
-- Port of the sibling app's 20261124001000_forms_unarchive.sql, adapted to Bubbles.
--
-- The Forms Register no longer has an Archive / Restore action, an Archived
-- shelf or an Archived badge, and nothing in the app (the lists, the follow-up
-- queries, the chat and the agent loop) filters or marks `archived_at` any
-- more. A form is Draft or Finalized (and `revised`, as the database has it).
--
-- THIS CLEARS THE OLD FLAG, so a form the flag had hidden is listed like any
-- other: a finalized one is kept on file, a draft can be deleted from the Forms
-- Register. Each cleared row gets an 'unarchived' event (the kind already
-- exists, 20260904003100) so its own history says what happened.
--
-- THE COLUMN STAYS. `form_instances.archived_at`, the view column that exposes
-- it (`form_instance_overview.archived_at`) and the `form_instances_active` /
-- follow-up partial indexes are left exactly as they are: dropping them means
-- recreating the overview view for no gain, and a column that is always null is
-- harmless. `form_template_versions.archived_at` (a replaced template version)
-- is a different thing and is not touched.
--
-- BUBBLES-ONLY CARE: the one-open-revision index (20261110201714) leaves an
-- archived revision draft out, so clearing the flag on one while another draft
-- of the same form is open (or on two archived drafts of one form) would be
-- refused by the index (23505) and fail the whole migration. Those rows are
-- the only ones skipped: per form, at most one archived revision draft is
-- cleared, and only when no other draft of that form is open. A skipped row
-- keeps `archived_at` (nothing reads it any more, so it is listed all the same)
-- and is counted in a NOTICE.
--
-- Idempotent: a second run finds no archived rows and changes nothing.
-- Status, finalized_at and every filled value are untouched.
-- ---------------------------------------------------------------------------

create temporary table forms_unarchive_ids as
with archived as (
  select
    id,
    status,
    revises_instance_id,
    case
      when status = 'draft' and revises_instance_id is not null
        then row_number() over (partition by revises_instance_id order by created_at desc, id)
    end as nth
  from public.form_instances
  where archived_at is not null
)
select a.id
from archived a
where a.nth is null
   or (
     a.nth = 1
     and not exists (
       select 1
       from public.form_instances open_draft
       where open_draft.status = 'draft'
         and open_draft.revises_instance_id = a.revises_instance_id
         and open_draft.archived_at is null
     )
   );

insert into public.form_instance_events (instance_id, kind, actor, detail)
select i.id, 'unarchived', 'system:archive-removed', jsonb_build_object('was_archived_at', i.archived_at)
from public.form_instances i
join forms_unarchive_ids u on u.id = i.id;

update public.form_instances
set archived_at = null
where id in (select id from forms_unarchive_ids);

do $$
declare skipped integer;
begin
  select count(*) into skipped from public.form_instances where archived_at is not null;
  if skipped > 0 then
    raise notice 'forms_unarchive: % archived revision draft(s) kept their archived_at because another draft of the same form is open', skipped;
  end if;
end $$;

drop table forms_unarchive_ids;
