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

**Also ported: "yes" to the app's own next-person offer (Ask Sunny 14fed8c, #1199; the squash of the sibling's branch
commit 8ffa353, unchanged on merge).** With CARD_PERSON_THIS_REQUEST
on, "write CAs for <A> and <B>, both late on 11/14" makes <A>'s card and the reply offers "Want me to make the … for <B>
next?"; the manager's "yes" was refused ("Who is this Corrective Action Form for?": `person_not_named`, as <B> was named
before <A>'s card, then `person_change_not_asked`). The one-word answer to the app's own offer, for the first name it
offered, now counts as <B>'s request in `personNamedOrPicked` (when the manager named <B> in this chat) and in the
guard's `ownRequest`. It reads this app's own reply (`offeredNextFirst`, the shape of `nextPersonOffer`), never the
manager's words. The code is the sibling's, line for line. Replay: `nov21-agent-loop-next-person-offer-yes-cases.ts`
(Fenna Prewitt / Ozren Brack); this app had no several-people case to reuse. The sibling's #1199 stand-in changes
(new_form_evidence on the other person's proposal in 8 nov14–nov16 cases) have no equivalent here: none of those cases
exist in this app's pack.
