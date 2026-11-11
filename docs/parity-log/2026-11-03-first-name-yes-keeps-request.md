## 3 Nov 2026: "Yes" to "Is this for <name>?" keeps the form request — Bubbles only (FIRST_NAME_YES_KEEPS_REQUEST_ENABLED, default off)

Replay set b2 (name invented): the first name came in an account ("I have an
employee <first name> at our Grand Island location who …"), the form was asked
for in the next turn, and "Yes" to "Is this for <full name>?" rewrote the turn
into the account alone (`answeredNow`, `ai/first-name-suggest.ts`): no card.
On, the turn the question answered follows the account. Ask Sunny: not
needed. Checked through its chat route with production's flags and the same
turns in its words: Sunny makes the Coaching card at "Create a Coaching Form
from this conversation." and never asks the question. (That card carries the
first name only, a separate behaviour reported to QA.)
