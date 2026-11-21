# 2026-11-21 — a message naming another person, not the open card's, with its own date is that person's request (ported)

**Ported from Ask Sunny (e1ad6f9, #1201).** Agent loop only, under CARD_PERSON_THIS_REQUEST_ENABLED (ON in this app's
production since 21 Nov 2026 13:31Z). No new flag.

QA2's ruling, belt-and-braces beside the live model's new_form_evidence: with a card or draft open for <A>, "the same
for <B>, he was late on 11/10/26" was refused (`person_change_not_asked`) when the model passed no new_form_evidence.
`agent-loop/tools.ts` now treats a message as <B>'s own request when, by the records, it names the card's person (the
roster), does NOT name the open card's or draft's person (any of their names, the first name alone included), and states
its own date. "Shift Lead, <B>, messaged <A> …" names <A>, so it is still refused.

The guard's code is the sibling's, line for line (the #1193 port left this block the same shape). Replay:
`nov21-agent-loop-new-person-own-account-cases.ts`, with the loop roster's invented Fenna Prewitt (<A>) and Ozren Brack
(<B>) at West Dodge, a location manager asking; the sibling's people and wording are not used.

Not covered: an undated "Do the same coaching form for <B>" still needs new_form_evidence (the same-coaching replay's
stand-in passes it).
