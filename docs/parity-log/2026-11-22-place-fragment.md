# The store the manager named leaves the account whole, state and all (QA's Bubbles round 2, R13)

**Fix (Ask Bubbles):** `withoutNamedSalon` in `src/lib/ai/agent-loop/tools.ts`. A store phrase can be followed by
", <word>" where the word is part of that store's own name, as in "At Dodge, NE" (the state). That word is part of the
phrase and leaves the account with it. A full stop that ends the phrase mid-account stays; at the start of the account
the phrase goes whole. A word after the comma that is not the store's own ("at Dodge, she …") is untouched, as before.

Report (QA's test name): "create a verbal CA for team member Testy Testerson at Dodge, NE. location. On 10-16-26
Testy was not properly measuring and weighing product. payroll deduct is not applicable". The Observation read "NE on
10/16/26 Testy …". Replay case: `nov22-r13-*`; unit test: `agent-loop/without-named-store.test.ts`.

**Ask Sunny: same gap, port pending.** Sunny's `withoutNamedSalon` is the same code (a salon's "City, ST" name loses
the city and keeps ", ST"). This session has read access only to Ask Sunny, so the port goes to the Sunny coder through
QA, titled `Port from Ask Bubbles (<sha>): …`.
