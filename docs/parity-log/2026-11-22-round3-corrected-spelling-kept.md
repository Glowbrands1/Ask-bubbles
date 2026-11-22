# A corrected spelling stays corrected after the correction turn (QA's Bubbles live round 3, A1(b))

**Root cause (Ask Bubbles):** "della varnick" corrected to "della varnich" (one letter, same first name, neither on the
staff list). The correction turn replaced the old spelling in the card's account (`withCorrectedSpelling` with the
recorded `nameCorrectedFrom`), but on the next turn ("she is at Omaha dodge") the model copied the first message's
"Della Varnick" back into the account; that turn has no correction and the person is on no staff list, so nothing
replaced it, and the saved coaching_details kept the old surname (#1037's fix reads the staff list only).

**Fix (`tools.ts`):** a two-word name in the account that an earlier card in this chat was made for (off the staff list,
by its record's one-way key) and that is a close spelling of the card's name (`closeSpellingOfName`, as #1006 reads a
correction) is the old spelling and becomes the card's name. A coworker's close-spelled name that no card was made for
stays. Records and spelling distance; no word list.

**Ask Sunny: same gap, port pending.** Sunny's card-level spelling pass reads the correction turn and the staff list
only. Read-only here; port through QA.
