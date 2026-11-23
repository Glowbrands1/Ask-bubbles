# The chat card and reply keep whose it is: "her personal life" is never "the personal life" (Pau's round 3, U23)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/reply-pronouns.ts` (the card/reply pronoun pass). "Tamsin … about her
personal life" read "about the personal life" on the card and in the reply, and "her boyfriend" "the boyfriend". QA's
ruling (option 2, card/reply pass only): the first possessive of the named person keeps its owner ("Tamsin's"); "the"
only after a place or time preposition (item 19, a closed set of prepositions) or once the sentence already said whose.

**The saved write-up is unchanged on purpose:** `src/lib/forms/employee-reference.ts` keeps HR's 3 Oct 2026 design ("Harper
submitted a resignation", "for the shift"). The chat card and the saved form may now differ on a possessive; the HR
write-up rule wins on the saved form.

**Ask Sunny: same pass, port pending.** Sunny's reply pass has the same rule (it was ported from Sunny: "a possessive of
the person already named in the sentence is \"the\""). The port goes to the Sunny coder through QA; this session has read
access only to Ask Sunny.
