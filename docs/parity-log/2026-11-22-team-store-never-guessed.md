# The team card's store comes only from a place the manager named (QA's Bubbles re-run, A8)

**Fix (Ask Bubbles):** `coach_team`'s results (new team card and team_card_updated) carry `store_question` and
`store_note` when the card has no store: ask from all stores, never narrow them by a word the manager did not give as a
store. `agent-loop/store-guess.ts`, wired into the loop's reply checks: a store the reply names (read by the app's own
store reader) that no manager turn names and the card does not hold goes back once; if it comes back, that sentence is
left out and the reply asks "Which store is this for?". No word lists.

Report (verbatim, no names): T1 "can you create a coaching form for my whole staff?", T2 "coaching is on sfs operations
for clean organization and flow. BCS has flagged our SFS …" — the reply asked "which Sioux Falls location is this for,
W 41st St or E 18th St?" (SFS = ship from store), and every later turn repeated it.

**Ask Sunny: same gap, port pending.** Sunny's coach_team result has no store question and its loop has no
guessed-store check (salon instead of store). Read-only here; port to the Sunny coder through QA.
