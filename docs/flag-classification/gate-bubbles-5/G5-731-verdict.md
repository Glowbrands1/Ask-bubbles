# Gate-Bubbles-5: #731 REVISION_ARCHIVED_NOT_OPEN_ENABLED: GO, on one condition (migration before flag)

- PR head 6041e16c, merged --no-ff onto main aecb3342, clean, tsc clean.
- Arms: 1 OFF + 1 ON. OFF = the worktree's production-flags.json "on" + "assumedOn" (325) exported as env; ON = that + REVISION_ARCHIVED_NOT_OPEN_ENABLED. Paths: src/lib/ai, src/lib/forms, src/app/api/chat, src/app/api/forms.
- 13748 tests (OFF 759 failing, ON 760). Changed 1: INTENDED-HARNESS 1, REGRESSION 0, FLAKY 0, UNCLASSIFIED 0. Replay pack: no record differs OFF vs ON (no chat path reads the flag). Table in G5-731.md.

## The one change, and the condition it shows
`src/lib/forms/archived-open-revision.test.ts` (QA 28 Oct) pins the flag-off answer and fakes the OLD index (20261025233000: archived drafts counted). ON, `findOpenRevision` skips the archived draft, the insert of a new revision hits the old index, and the manager gets "Could not open the revision: duplicate key value violates unique constraint form_instances_one_open_revision". With the PR's migration 20261110201714 (index narrowed to `archived_at is null`) the PR's e2e twin holds: a new draft opens, and asking again returns it (15/15 in finalized-form-revision-e2e.test.ts, flag on).
So: turning the flag on in an environment whose database still has the old index breaks "Edit as new draft" on every form with an archived revision draft. Migration 20261110201714 must be applied before the flag goes on. (The PR says the file was renamed to the version Supabase recorded; this gate did not read the database.)
Asked of coding (non-blocking): give archived-open-revision.test.ts a flag-off pin (stubEnv "") or a flag-on twin with the narrowed index, so a production-env run does not read it as a break.

- instances.ts diff on the merged tree is byte-identical to docs/patches/revision-archived-not-open.patch (Pau, "ok revision archived", 10 Nov).
- Open replay case ids that now hold: none (the PR adds no replay case; its cover is the forms e2e).

QA, 12 Nov 03:39 UTC: migration 20261110201714 confirmed applied (index has archived_at IS NULL). Condition met: GO.
