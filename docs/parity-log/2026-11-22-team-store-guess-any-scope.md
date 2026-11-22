# A team card's guessed store is checked for every scope and on turns with no tool call (QA's Bubbles live re-run 2, A8)

**Root cause (Ask Bubbles):** #1010's guessed-store check (`agent-loop/store-guess.ts`) ran only on a team card waiting
for its store (`needs_location`) made or updated this turn. On production f9461c1 QA's global login got a team card
with no store that is `ready` (a global login may file a form with none), so the check never ran. T3 "this is perfect"
and T4 "make that update" called no tool (production's trace: steps `[]`), so there was no card to read. The pack's case
used a three-store store manager. The live model in the #1008 harness did not narrow the stores, so the gap showed only
in production.

**Fix:** the check runs on any team card that holds no store, whatever its status. On a turn with no tool call it reads
the team card shown under the last reply from its card record (no person, the team label's key, no team store), as
`tools.ts` already does. The fallback also drops the question right after a dropped sentence that named the guessed
stores ("… A and B. Which one is this coaching for?"). No word lists.

Report (verbatim, no names): T2 "coaching is on sfs operations for clean organization and flow. BCS has flagged our SFS
…" got "You have two Sioux Falls stores — Sioux Falls, SD (W 41st St) and Sioux Falls, SD (E 18th St). Which one is this
coaching for?"; T3 "this is perfect" got "… which Sioux Falls store this is for — W 41st St or E 18th St …".

**Ask Sunny: same gap, port pending.** Sunny's port of #1010 (`run.ts`, `teamNoSalon`) is gated on
`status === "needs_location"` for a card made this turn and on the card record's `teamNeedsLocation` otherwise, so a
global login's ready team card with no salon is never checked. Its `withoutSalonGuess` keeps the dangling question.
Read-only here; port to the Sunny coder through QA (salon for store).
