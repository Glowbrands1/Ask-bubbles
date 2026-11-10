# Bubbles-only: POSSESSIVE_PLACE_ACCOUNT_ENABLED (the ask-who card's What happened)

QA, the Bubbles round-7 live test (9 Nov 2026): the ask-who card for "create a CA for Lee's Summit Plaza, she was late
on 10-20-26" read "What happened: Lee's Summit Plaza". With the flag, that card's Issue is the words after the place
("she was late on 10-20-26"), or blank.

Not needed in the sibling app (checked on its main 8c772bff, POSSESSIVE_PLACE_NOT_PERSON live there since round 8):
"create a CA for Hadley's Crossing Plaza, she was late on 10-20-26" (its own wording, an invented place) gives the
ask-who card with no Issue at all, so "What happened" is blank, which QA accepts.
