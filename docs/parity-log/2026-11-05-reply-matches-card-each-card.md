# REPLY_MATCHES_CARD with two or more cards — Bubbles only

**Date:** 5 Nov 2026 · **Bubbles:** claude/rmc-each-card (REPLY_MATCHES_CARD with two or more cards: each section names its own card's person)

QA's tester on the Bubbles smaller flip, item 6 "two forms": the reply's Corrective Action section named the
Coaching card's person, because `replyMatchesCard` read only the first card (`formProposal`) and rewrote every
"… **<form>** for **<name>**" line to it. The fix matches each line to the card of its form when the reply
carries `formProposals` (two or more).

**Not ported to Ask Sunny:** Sunny has no multi-form replies — its `AskResponse` has no `formProposals`, and the
same message ("a coaching form for <A> … and a CA for <B> …") gets one "Which person did you mean …?" question,
never two cards — so REPLY_MATCHES_CARD there only ever sees one card. Port this with the multi-form proposal
mechanism if Sunny ever gets it.
