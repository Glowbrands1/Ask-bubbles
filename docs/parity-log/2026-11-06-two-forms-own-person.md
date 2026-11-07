# Sibling-only note: two forms for two people in one message (TWO_FORMS_OWN_PERSON_ENABLED)

The sibling app's tester after its flip (6 Nov 2026, row 6) sent "Coaching form for <R>. Also a CA for <R2>." and got ONE Coaching card whose employee was R2, the Corrective Action's person. The Corrective Action was dropped without a word. The sibling app makes one card per message, and the models' reading of R2 won over the coaching request's own "for <R>". There, under TWO_FORMS_OWN_PERSON_ENABLED (default off), a post-step on the finished answer (`ai/two-forms-own-person.ts`) does three things:
- it keeps the card's employee only when the card's own clause names them;
- otherwise it clears the employee (and a salon read from them), and the card asks who;
- it names every other request back.

It reads the message with this app's `forms/form-requests.ts`, ported there as a reader only.

Not ported here: this app already proposes one card per request (`severalFormsRequested` in `ai/form-proposal.ts`, since 8 Oct 2026), each read from its own clause, and QA's tester got two correct cards for this shape. REPLY_MATCHES_CARD's each-card rule (#483) names each card's own person in its section. Nothing here changes. The full port of the several-cards path to the sibling app is its own item there.
