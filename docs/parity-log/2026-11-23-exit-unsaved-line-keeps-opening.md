# An unsaved exit line leaves alone; the reply's opening on the same line stays (QA, 23 Nov 2026)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/exit-read-back.ts` (`withoutUnsavedExitLines`). When the model repeats an
exit line the card does not save, the app left the whole reply line out. The live reply wrote its opening and the unsaved
line on one line ("Here's the Resignation/Exit Form for **<P>**. **Date that notice was given:** …"), so the opening left
too and the reply opened on "<P> shows as no longer active …". Now only the sentence holding the unsaved label leaves (from
that sentence's start to the end of its value); a line with nothing else left still goes. Cases:
`nov23-u22-exit-unsaved-line-on-opening-line-keeps-opening` (fails on main) and the unit tests in `exit-read-back.test.ts`.

**Ask Sunny: same bug, port pending.** Sunny's main (daa2b3c) has the same whole-line drop in
`src/lib/ai/agent-loop/exit-read-back.ts`. The port goes to the Sunny coder through QA; this session has read access only
to Ask Sunny.
