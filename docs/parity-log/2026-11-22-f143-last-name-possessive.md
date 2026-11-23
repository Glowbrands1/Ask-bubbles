# "show me <last name>s forms" names the one person with that last name (board f143)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts`, `formsOnFileAskedFor`. The forms-on-file guard already took a
first or preferred name that only this person holds on the roster, and its possessive with or without the apostrophe
("fennas"; QA's item 15). Last-name words now count the same way: a last-name word only this person holds names them,
whole or as a possessive. It never counts when the word with the s is itself a roster name, or when another roster person
shares the last name. Read from the roster's own names; no word list.

Report: board f143, "show me <last name>s forms" was refused as someone else's forms in both apps.

**Ask Sunny: same gap, port pending.** Sunny's `withRosterPossessives` (its #1208) turns "<last>s" into "<last>'s",
but its `namedIn` check only accepts a full name, a typed name the roster reads as this person, or a close spelling of
the full name. So a last name alone, possessive or not, is still refused there. The port is held until this passes QA's
live run. It goes to the Sunny coder through QA, titled `Port from Ask Bubbles (<sha>): …`.
