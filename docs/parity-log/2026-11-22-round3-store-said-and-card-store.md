# The card's store as the manager said it; the card record keeps its store id (QA's Bubbles live round 3, A7 and A1(a))

**Root causes (Ask Bubbles, production 1c71e11, from the stored replies, cards and loop traces):**
- A7: the card was filed at the store the manager named ("at empire, sd", the reviewed nickname, #1046), but nothing
  told the model the manager's words were that store; it wrote "where Woven lists <P>'s store (Empire, SD isn't one I
  recognize …)". When the employee's Woven primary was the same store, `store_from_woven` was also set, so the model was
  told the wrong reason.
- A1(a): T4 "she is at Omaha dodge" left no card (trace: card null), and the reply's true "filed at Omaha, NE (West Dodge
  Rd)" was checked against the card record, which held no store for a person's card (only `teamStoreId`); the mismatch
  replaced the reply with "Which store is this for?".

**Fix:** propose_form names the words the store reader matched as the card's store (`store_said`, any store phrase; it
wins over `store_from_woven`), with a rules-book line; a reply that uses the rules book's own "where <staff system>
lists" line with no `store_from_woven` this turn goes back once and that sentence is left out if it comes back. The card
record keeps the card's store id (`storeId`, an id, never a name), and the no-card check reads it. No word lists.

**Ask Sunny: same gaps, port pending.** Sunny's propose_form has no `store_said`, its card record keeps only a team
card's salon, and its no-card check has no salon. Read-only here; port through QA (salon for store).
