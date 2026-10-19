# Low-priority UI issue: overlapping template-sync loads show a misleading banner

**Priority:** low. **Status:** documented, not fixed. No production code changed. **Found:** 2026-10-19, during the Phase 2B (prescreen v3) production sync.

## What happened
An administrator hard-refreshed Forms → Form Templates. Two page loads ran about 3 seconds apart and overlapped:

| Time (UTC) | Logged `forms.template_sync.completed` |
|---|---|
| 13:29:19 | `revised: ["prescreen-phone-interview"]`, `renamed: ["prescreen-phone-interview"]` — this load did the work |
| 13:29:21 | `revised: []`, `renamed: ["prescreen-phone-interview"]` — the overlapping load |

The banner the administrator saw ("1 renamed · 17 already up to date … prescreen-phone-interview") was the **second** load's result, so it looked as if the revision had been skipped. The database was correct: exactly one new version (v3, rev 3) was published, v2 was archived untouched, and nothing was duplicated.

## Why
`ensureTemplateLibrary` reads the template rows once, then for each template runs `syncTemplateDisplay` (name, short name, description) and `publishSeedRevision`. The second load read the rows before the first load's description update was committed, so it saw the old description and wrote the same new text again (reported as "renamed"). It then found v3 already stored, so it reported no revision.

## Impact
- Cosmetic only: the sync is idempotent and the version publish is guarded by the unique (template, version) constraint and the seed-revision check.
- The harm is a confusing or alarming message to the administrator, and a log line that appears to contradict the first one.

## Options for a later fix (not chosen yet)
1. Make the display sync a conditional write (`update … where description is distinct from …`) and report "renamed" only when a row actually changed.
2. Have the page surface the most recent non-empty result, or aggregate results from overlapping loads.
3. Avoid the double load (find what fires the second render on a hard refresh).

Option 1 is the smallest and addresses the misleading message directly. Add a test with two concurrent `ensureTemplateLibrary` calls over the fake store asserting one `revised` in total and `renamed` reported at most once.
