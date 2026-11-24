# HR's queue leaves out archived forms; archiving clears HR's request bell (23 Nov 2026, QA)

**Sibling app: already present.** Ask Sunny #1300 (Sunny coder 1, branch claude/hr-queue-skip-archived, head fc0566f1)
makes the same change; this one uses its names.

QA: "An archived form that was pending HR must never show in 'Needs your decision', be counted, or ring a bell."
Archiving hides a form without changing its status or its HR state (`archiveInstance`), so a pending form that was
archived stayed in HR's queue.

- `listHrQueue` reads only `archived_at is null` rows. Everything that shows, counts or rings for HR goes through it:
  the "Needs your decision" list, its count (`hrQueueSummary`), the 6 AM reminder (`runHrReminders`), and the AI's read
  of HR's queue (`readHrApprovalsFor`).
- `listMyFormsWithHr` and the approved forms in `readHrApprovalsFor` leave archived forms out too, as in Sunny #1300.
- `archiveInstance` calls `clearRequestBells` for a form whose HR approval is pending, so HR's "waiting for your
  approval" bell stops pointing at it. Restoring it puts it back in the queue and rings nothing.

Tests: `hr-approval-lifecycle.test.ts` ("an archived form is out of HR's queue": the list, the count, the AI read, the
6 AM bell, the request bell cleared, the manager's own list, restore). Replay: `nov23-hr-queue-archived-cases.ts`. All
fail before and pass after. The test fake (`src/test/fake-supabase.ts`) now models `upsert(..., { ignoreDuplicates:
true })` as Postgres does (an existing row left alone, only new rows returned), which the reminder's once-a-day check
reads.

**Superseded (Pau, 23 Nov 2026, archiving removed):** Bubbles has no archived forms any more, so the archived-form half of this entry is moot here; its archived replay/test cases were removed on purpose.
