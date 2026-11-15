## 15 Nov 2026: DM L10 Bloom-style Rocks and To-dos (part d)

Port from Ask Sunny #1044 (`020a860`). On the Bloom-style DM L10 the Rocks page gets an "All rocks (n)" tab, Expand
milestones, Owner: A–Z, owner headers with initials, a segmented milestone bar (done / overdue / to do) and a chevron
that opens each rock's milestones. The To-dos page gets "X% Completed", Owner: A–Z, quick-add, round checks, initials,
a chevron and MM-DD-YYYY due dates. `Rocks.tsx`, `Todos.tsx` and `MeetingView.tsx` are copied as they are.

Ask Bubbles differences: none in the code. The accents use the bronze tokens, which Ask Bubbles' `.hub-l10` block
re-points to its teal. The test clicks this agenda's "To-Do List" title.

Sibling app: already in Ask Sunny (#1044, `020a860`); this is its port.
