# The store, written as an aside, leaves the account with its commas (QA's Bubbles live re-run, 23 Nov 2026, A1)

**Root cause (Ask Bubbles):** on production 9340334 the tester's A1 T3 ("Create the coaching form with the information
given. Her name is <P> and she is at Dodge. …") got the card's account "<First>, was 10 minutes late to the shift on
10/5." The model wrote the store as an aside ("<P>, at Dodge, was …"). `withoutNamedSalon` read only the space before
"at", so it took the phrase and its closing comma and left the opening one. With the store after a title in one aside
(", a makery associate at Dodge, was"), it dropped the comma that closes the aside.

**Fix (`agent-loop/tools.ts`, `withoutNamedSalon`):** the phrase's comma before it is read too. A phrase with a comma
before it is an aside and leaves with that comma; the text after it follows the words before it. With no comma before it,
a comma after it closes something earlier and stays. At the very start, the phrase leaves with its comma, as before.
Store data and punctuation only.

**Tests:** `without-named-store.test.ts` (three new cases fail before, pass after; the earlier R13 cases unchanged);
replay cases `nov23-a1-store-aside-leaves-with-its-commas` and `nov23-a1-store-after-title-aside-keeps-closing-comma`
(T1–T3 verbatim) fail before and pass after.

**Ask Sunny: same gap, port pending.** Sunny main daa2b3c has the same regex in `withoutNamedSalon` (`tools.ts`, the
`(^|[\s,;])(?:at|in)…(,?)` replace). Read-only here; port through QA (salon for store).
