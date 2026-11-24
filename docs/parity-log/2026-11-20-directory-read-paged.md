# 2026-11-20 — the whole-directory read is paged (port from Ask Sunny #1142)

**Sibling app: ported from Ask Sunny #1142 (main `2923160b`).**

`readDirectoryRoster` and the flag-off read in `readDirectoryFacts` (`src/lib/forms/employee-roster.ts`) asked for
5,000 / 20,000 rows, but the service answers at most 1,000 per request, so past that the directory was cut short with no
error. Both now read through one helper (`wholeDirectory`) that pages every read with the file's own `readAllPages`,
ordered. In this app `readDirectoryRoster` backs the flag-off scoped roster and the typo reader's protected name words
(`ai/typo-name-words.ts`); ROSTER_STORE_SCOPED is on in production, so the scoped roster already paged. Sunny's agent-loop
"no longer active in Woven" check has no counterpart here (no loop).
