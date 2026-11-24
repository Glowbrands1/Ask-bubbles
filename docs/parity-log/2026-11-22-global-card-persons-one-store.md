# A global login's card for someone at one store is filed at that store (QA's Bubbles round 2, U29; "Create without a store")

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts`, the global login's which-store step (GLOBAL_STORE_ASK). When
Woven lists the card's person at one store (primary first, then their stores), that store becomes the card's store
and the reply says so as `store_from_woven`, the same way a store manager's card already works. A person at several
stores, or at none, is still asked once, as before.

Report: a global district manager's T1 "create a coaching form about accountability", T2 "I want the same form for
multiple employees", T3 "no put the employee as <P20>". The card asked "Which store is this for? You have several
stores", though Woven lists <P20> at Bellevue only, and Create saved the form with no store. Replay cases:
`nov22-u29-*`.

**Ask Sunny: same gap, port pending.** Sunny's global which-salon step (`globalNonAdminNeedsSalon`) asks the same way
without reading the person's salons. This session has read access only to Ask Sunny, so the port goes to the Sunny
coder through QA, titled `Port from Ask Bubbles (<sha>): …`.
