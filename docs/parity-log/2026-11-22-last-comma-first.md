# "<Last>, <First>" kept off the staff list is read as "<First> <Last>" (QA's Bubbles re-run, C3)

**Fix (Ask Bubbles):** `lastCommaFirst` in `src/lib/ai/agent-loop/tools.ts`. A name written as two single words around
one comma is, by its own shape, "Last, First". Every check (the staff-list lookup, "the manager typed it", the
use-<name> question) still reads the name as typed; only the card's name, when kept off the staff list, is
"<First> <Last>", so the reply's bold, the Observation and the Expectation use it. Any other shape is kept as typed.
No word lists.

Report (names masked): "create a CA form for <Last>, <First> at dodge. she was late on 10-16" — the person is not on
the Bubbles staff list (QA's check); the card kept "<Last>, <First>", the reply's bold broke ("**<Last>,**."), the
saved Observation stated the lateness twice and the Expectation used the surname as the first name.

**Ask Sunny: same gap, port pending.** Sunny's off-roster path keeps the typed name the same way (no comma reading).
Read-only here; port to the Sunny coder through QA.
