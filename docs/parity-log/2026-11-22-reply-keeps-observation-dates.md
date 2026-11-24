# The reply restating the card's account keeps the account's dates (QA's Bubbles re-run, A3)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/observation-dates.ts`, wired into the agent loop's reply review
against the card (`run.ts`, `mismatchOf`). A reply sentence that restates one of the card's Observation sentences (most
of its words, dates aside) must carry that sentence's dates. Otherwise the reply goes back to the model once with the
card's facts, like every other card mismatch; a second misdated restatement is left out of the reply. It is never
offered as "a change that isn't on the card yet". No word or phrase list: the check reads the card's own Observation.

Report: "create corrective action for <P> for violating standards of conduct policy on 10-20-26. <P> failed to
acknowledge policies in woven by the 10-15-26 deadline." — the card said 10/15/26, the reply said "by the 10/20/26
deadline".

**Ask Sunny: same gap, port pending.** Sunny's `src/lib/ai/agent-loop/run.ts` (`mismatchOf` → `cardMismatch`) compares
only level, payroll, amount, policy, store and the "Dated" date, so the same reply passes there. This session has read
access only to Ask Sunny; the port (`observation-dates.ts` + the three `run.ts` lines + the unit test, salon wording
unchanged since the check reads no wording) goes to the Sunny coder through QA, titled
`Port from Ask Bubbles (<sha>): the reply restating the card's account keeps the account's dates`.
