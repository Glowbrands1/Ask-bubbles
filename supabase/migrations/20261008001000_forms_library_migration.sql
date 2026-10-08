-- Ask Bubbles — the migrated forms library (additive only).
--
-- 1. THREE LAYOUT FAMILIES THE MIGRATED TEMPLATES ARE WRITTEN IN.
--
--    The seventeen HR templates carried over from the reference platform are
--    stored with their own layout families: `epp` (the SDIT, TSD, ASD-SDIT and
--    FTTC performance plans), `dmit_epp` (the DMIT EPP's two reviews) and
--    `exit` (the Resignation/Exit Form). The governance and read-permission
--    rules ported with them key on those values, so they are added rather
--    than mapped onto this deployment's generic `review` / `separation`.
--    Nothing is renamed or removed: the existing values and every row that
--    uses them are untouched.
--
-- 2. THE PRIVATE BUCKET FOR OFFICIAL REFERENCE COPIES.
--
--    `form_template_assets.storage_bucket` has defaulted to 'forms-templates'
--    since the forms engine migration, and "Replace with new PDF" stores the
--    uploaded PDF or Word file there byte for byte. No migration created the
--    bucket, so uploads had nowhere to go. Private, unconditionally, like
--    `knowledge-documents`: no storage.objects policy is created for `anon`
--    or `authenticated`; the server-side route reads and writes with the
--    service role. 25 MB matches the upload route's own limit.

alter type public.form_layout_family add value if not exists 'epp';
alter type public.form_layout_family add value if not exists 'dmit_epp';
alter type public.form_layout_family add value if not exists 'exit';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'forms-templates',
  'forms-templates',
  false,
  26214400, -- 25 MB
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
