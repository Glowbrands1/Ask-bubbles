# One prior step with a problem never drops the others (QA's Bubbles round 2, U09)

**Fix (Ask Bubbles):** `priorActionsSplit` in `src/lib/ai/agent-loop/tools.ts`. The model's prior actions are checked
step by step with the existing `priorActionsProblem`: good steps are kept in order; a step with a problem (its date is
the incident's, or a date the manager never gave) is left off and named in `prior_steps_left_off` with its reason. A
problem with the whole list (the count the manager said) or a list with no good step refuses the line as before.

Report (masked): T2 "JBA Policy Manual 1-1-2026, Verbal CA 11-1-2026. On 11-1-26 <P6> violated care and cleaning of
facilities policy" — the card kept no prior action ("11-1-2026 is this incident's own date"), losing the 1-1-2026 step.

Not in this fix: U09's saved draft without the card's Written level (separate item).

**Ask Sunny: same bug, port pending.** Sunny's `priorActionsProblem` refuses the whole line the same way. Read-only
here; port to the Sunny coder through QA.
