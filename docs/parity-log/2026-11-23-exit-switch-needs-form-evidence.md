# A switch to the exit form needs the same evidence as any form change (QA, the exit-lock gap)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts` (propose_form's form lock). A switch to the exit form passed on
any real quote of this turn as exit_evidence; it now needs what every other form change needs (`lockLeft`: the quote
names the form, or answers the app's own offer of it). `quoteNamesForm` reads a name with alternatives ("A/B Form") as
each alternative with its last word, from the name's own shape.

**Ask Sunny: same gap, port pending.** Sunny's main (7787aa9) has the same `exitAsked` check (a verified quote only) in
the same lock condition. The port goes to the Sunny coder through QA; this session has read access only to Ask Sunny.
