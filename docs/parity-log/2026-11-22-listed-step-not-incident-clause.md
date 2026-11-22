# The incident's own clause is never a listed prior step (follow-up to #1054, found by Ask Sunny's port)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts` (`listedWithKeptSteps`).

"ca for <P>, she was late on 11/12, she had a verbal on 10/2", with no incident date from the model, made #1054's
`listedWithKeptSteps` list the incident's own clause: Prior actions "Verbal CA — 10/02/2026; she was late on —
11/12/2026". This incident's dates are now the incident date the model gave, or with none, the dates of the card's own
account that no step the card keeps holds. A clause with one of those dates is this incident, never a step. U09's
listed manual step (the model gives the incident date there) is still a step.

Replay: `nov22-listed-step-incident-clause-not-a-prior-step` (fails on main, passes here). Unit:
`account-without-prior-steps.test.ts` (controls: U09's manual step with the incident date given; a listed step whose
date the account does not hold).

**Ask Sunny: already fixed there** in its port of #1054 (QA, 22 Nov 2026). Sunny's rule ("a clause whose date is in the
card's own account counts as this incident") is the same in effect. Here a date the account holds counts only when the
model gave no incident date, so U09's live account that copied the manual step still lists it.
