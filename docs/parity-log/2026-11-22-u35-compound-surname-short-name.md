# A two-word surname is never cut to one word on the card or the saved form (QA's live round 3, U35)

**Fix (Ask Bubbles):** `src/lib/forms/short-name.ts`. The short-name passes (`withShortName` on the card's account and
the saved write-up fields, `replyWithShortName` on the reply) used to match only the person's full name. They now
also take the first name with part of the person's own surname, its words in order, as a mention of the person, and
give it the short name. The forms are built from the person's own name words, never from a word list.
`withCorrectedSpelling` still matches whole spellings only, so it never matches inside the correct full name.

Report: for an employee with a two-word surname ("<First> <Surname1> <Surname2>"), after T4 "fix her last name
<surname2>", the card's Observation said "<First> <Surname2> received a customer complaint", and the saved Observation
kept it.

**Ask Sunny: same gap, port pending.** Sunny's `short-name.ts` `namePattern` is the same full-name-only pattern, so a
"<First> <Surname2>" written by the model goes through there too. The port is held until the Bubbles fix passes QA's
live run. It goes to the Sunny coder through QA, titled `Port from Ask Bubbles (<sha>): …`.
