# A prior step the manager dates on the incident's day stays on the card (QA's live round-2 re-run, U09)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts` (`datedByManagerForStep`, used by `priorActionsProblem`). "JBA
Policy Manual 1-1-2026, Verbal CA 11-1-2026. On 11-1-26 <P> violated …": the Verbal CA's own date is the incident's date,
so #1015's per-step check still left it off ("that's this incident's own date"). A date the manager typed in the same
clause right after the step's own words is that step's date, even when it is also the incident's; the model copying the
incident's date onto an older step has no step word before it.

The report's second symptom, "(JBA Policy Manual 1/1/2026)" in the Observation, did not appear in four live runs of the
verbatim chat (main and this branch); asked QA where it was seen (the card or the saved form after Create).

**Ask Sunny: check before porting.** Sunny's tools.ts has neither #1015's per-step split nor this; the port depends on
#1015's.
