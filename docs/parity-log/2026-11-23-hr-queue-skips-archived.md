# HR's queue leaves out archived forms (23 Nov 2026, QA)

**Sibling app: to port.** Ask Sunny's `listHrQueue` has the same read without the archive filter; the port goes through
coder 3, who pushes to ask-sunny.

QA: "An archived form that was pending HR must never show in 'Needs your decision', be counted, or ring a bell."
Archiving hides a form without changing its status or its HR state (`archiveInstance`), so a pending form that was
archived stayed in HR's queue. `listHrQueue` now reads only `archived_at is null` rows from `form_instance_overview`.
Everything that shows, counts or rings for HR goes through it: the "Needs your decision" list, its count on the Overview
card and the tab badge (`hrQueueSummary`), the 6 AM reminder bell (`runHrReminders` → `hrQueueSummary`), and the AI's
read of HR's queue (`readHrApprovalsFor`). Restoring a form from the archive puts it back.

Tests: `hr-approval-lifecycle.test.ts` ("an archived form is out of HR's queue": the list, the count, the AI read, the
6 AM bell, restore). Replay: `nov23-hr-queue-archived-cases.ts`. Both fail before and pass after. The test fake
(`src/test/fake-supabase.ts`) now models `upsert(..., { ignoreDuplicates: true })` as Postgres does (an existing row left
alone, only new rows returned), which the reminder's once-a-day check reads.
