# Not needed here: two forms for two people in one message (the sibling app's TWO_FORMS_EACH_PERSON_ENABLED)

The sibling app's live tester after its flip 7 (QA, 7 Nov 2026): "Coaching form for <A>. Also a CA for <B>." gave one
Coaching card with no employee and "ask for <B>'s CA on its own". That app makes one card per message, so its fix
(TWO_FORMS_EACH_PERSON_ENABLED) answers the card again from its own request and offers the other form.

Not needed in this app: it makes one card per request, each drafted only from what was said about its own person
(`formProposals`). With the models reading B for the whole message, the same wording gives a Coaching card for A and
a Corrective Action card for B. Checked on main 7 Nov 2026; the wording is a guard case in the replay pack
(`nov7-two-forms-each-person-cases.ts`).
