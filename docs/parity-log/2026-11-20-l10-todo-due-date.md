# 2026-11-20 — L10: a To-Do's due date when adding and editing, in both layouts (port from Ask Sunny #1176)

**Sibling app: ported from Ask Sunny #1176 (branch `claude/l10-todo-due-date`, `d0f7c969`; draft when ported).** Pau:
"pls help add due date for both sunny and bubble".

This app's Bloom layout (the DM L10) already took a date when adding and in a To-Do's details (the owner, 17 Nov 2026).
What was missing here is the sibling's list-layout half: the list layout took a date only when adding and could never
change it, and showed the raw `2026-11-27`. Now:

- `lib/todo-due.ts` (`calendarDate`, `todoDueLabel`, `withTodoDueDate`), as in Sunny: one rule for set and clear in both
  layouts; clearing removes `dueDate` and goes back to "Next wk".
- `Todos.tsx` list layout: the due label is a button ("Due Fri, Nov 27", or "Next wk") that opens a date picker; add,
  change and clear go through `withTodoDueDate`. The Bloom layout's add and details picker use the same helper.

No database change: `dueDate` is already saved in the Hub's meeting document. AI readers: the Past meetings reader
(`lib/past.ts`) already carries `dueDate`, and the L10 assistant's getMeeting / getMeetingRecaps run in the Leadership Hub
on the same document.
