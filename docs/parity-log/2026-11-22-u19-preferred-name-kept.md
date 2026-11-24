# A first name inside the account never switches the card's name (round 2's offline replay, U19)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts`, `nameAsSaid`. Once the manager has typed either of the person's
FULL names (the preferred or the legal first name, with the surname), the full name typed last is the card's name. A
first name alone inside an account ("on 11/14 <legal first> worked …") no longer flips it. With no full name typed, the
first name used last, as before (B6, item 19).

Report: T1 "make a corrective action for <preferred> <last> …", T3 "observation of offense: on 11/14 <legal first>
worked 50 minutes over …". The card flipped from the preferred to the legal name unasked.

**Ask Sunny: not needed for this.** Sunny's `nameAsSaid` is the older rule: the preferred name wins whenever it was
typed at all, so a legal first name in the account never flips its card. Sunny also doesn't have Bubbles' "the name
used last" rule (B6, item 19: "yes it is for <legal full name>" moves the card). If that B6 fix is ported there, this
full-name refinement should go with it.
