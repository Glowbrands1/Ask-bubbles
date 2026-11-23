# A re-propose of the card on screen keeps its account and prior actions (Pau's round 3, U35 T11 and U21 T7)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts` (propose_form). "Create a Corrective Action Form from this
conversation." re-proposed the card on screen with no what_happened, and "add the direct policy …" with no
prior_actions: the card lost its Observation, or its Prior actions. With this person's card on screen (by roster id, name,
or the name this call corrects) holding an account (its record's account key) or prior steps (its record's step dates), a
call without them goes back once (card_account_missing / card_prior_actions_missing). A switch between the account forms
carries the account; a switch to the exit form does not (its account is how and when they left; QA's ruling). A new
account, or the steps left after a removal, are kept as passed.

**Ask Sunny: same gap, port pending.** Sunny main (7787aa9) has neither guard; its propose_form reads the account from the
request's own words and `keptPriorActions ?? onFileLine`, as here before. The port goes to the Sunny coder through QA; this
session has read access only to Ask Sunny.
