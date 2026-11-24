# 2026-11-20 — one typed word never matches a two-word name (port from Ask Sunny #1160, matcher only)

**Sibling app: ported from Ask Sunny #1160 (branch `claude/forms-on-file-close-spelling-asks`, head `718a6a44`; not yet
merged on Sunny's `main` when ported).**

- `closelySpelledEmployee` (`src/lib/forms/reopen-close-spelling.ts`, REOPEN_CLOSE_SPELLING, on in production): each word
  of a name on file needs its own typed word that spells it closely, each typed word used once. Before, one typed word
  ("tes") one letter from both "test" and "te" counted for both, and opened that person's form.
- Agent-loop part (find_past_forms asks "Did you mean …?", never opens): not ported, no loop here.
