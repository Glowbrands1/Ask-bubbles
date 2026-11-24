# Adding a prior step never removes the forms on file from the card (QA's live regression set, A13)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts` (propose_form's Prior actions). With this person's card of this
form on screen, a request that adds a step ("in the previously recieved coaching include that <P> signed … on 10-15-26")
kept only the model's list, so the step filled from the forms on file left the card. The forms on file now stay beside
the added steps; one whose date a kept step already has is that step, listed once.

**Ask Sunny: same gap, port pending.** Sunny's propose_form reads `keptPriorActions ?? (statedSteps.length === 0 ?
onFileLine : null)` (main 7787aa9): a kept model list replaces the on-file line there too. The port goes to the Sunny
coder through QA; this session has read access only to Ask Sunny.
