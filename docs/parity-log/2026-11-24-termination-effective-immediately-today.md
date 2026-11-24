# A termination "effective immediately" is dated today (Pau's ruling, 24 Nov 2026, via QA)

**Ruling (Pau's words):** "effective immediately for termination - should be dated today".

**Fix (Ask Bubbles):** `propose_form` (`src/lib/ai/agent-loop/tools.ts`, `exitTermination`): a termination is dated the
effective date the manager's words state (`statedEffectiveDates` in `src/lib/forms/exit-facts.ts`: a date read as
"effective <date>", the shape the form's own termination reader uses); the model's `effective_date` counts only when it
is one of those. Never a no-show date, never the last day worked (item 7); with none stated ("effective immediately"),
today. The rules book and the `effective_date` description say the same. Cases:
`nov24-agent-loop-termination-effective-immediately-cases.ts` (the no-show-date and last-day cases fail on main; the
plain "effective immediately" case and the stated-date control pass on both).

**Ask Sunny (main): same gap, port needed.** Sunny's `exitTermination` falls back to the last day worked
(`readExitFacts(...).lastDayWorked`) and takes any typed date the model passes as the effective date. Port the mechanism
(salon ↔ store wording only).
