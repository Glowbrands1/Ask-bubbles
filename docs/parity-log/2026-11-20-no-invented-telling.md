# 2026-11-20 — the write-up never invents a telling (port from the sibling app, f082)

**Ported** from Ask Sunny `d078cab` (f082, QA's live test, 20 Nov 2026). Same narrative guard here (`narrative-draft.ts`,
`GROUNDED_SPECIFICS`): a drafted sentence asserting the employee was told / informed / reminded / warned is dropped unless
the manager's notes describe a telling in any words. Not ported: the sibling's left_early attendance kind, which lives on
its agent loop's card (`attendanceKind`); this app has no agent loop. Port it with the loop.
