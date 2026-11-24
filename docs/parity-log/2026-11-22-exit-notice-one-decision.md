# "Gave notice and is fulfilling it" never also ticks "Did not fulfill" (QA's Bubbles re-run, B6)

**Fix (Ask Bubbles):** the exit card's "one decision" (the exit form's own reader's tick wins over the model's
exit_how) now counts BOTH Resignation Details groups: `resignation_notice` (Submitted & Fulfilled Notice) and
`resignation_type`. The template splits one set of boxes into two groups only for the page's layout (`exit-library.ts`).
At card time (`agent-loop/tools.ts`, `readerTypeTicked`) and again at Create (`forms/instances/route.ts`), a reader tick
in either group means exit_how is not carried. Template data, no word lists.

Report (names masked): T1 "can you make me an exit form for <P1> she is in woven under <P2>. Her last day is nov 23 she
is returning her key she gave 2 weeks notice and is fulfilling them. no deduction at this time" … T6 "she is resigning
due to second job I'm ready for the draft" — the card and the saved draft ticked Submitted & Fulfilled Notice AND Did not
fulfill required 14 day / 30 day notice.

Not in this fix (reported to QA): T6's reply said the form has no reason line while the saved draft has
resignation_reason; the Resignation Date took the notice date.

**Ask Sunny: same bug, port pending.** Sunny's `readerTypeTicked` reads only `EXIT_TYPE_GROUP` (tools.ts ~4019), and its
card ticks combine the notice group with exit_how (~2482). Read-only here; port to the Sunny coder through QA.
