# Bubbles only: "copy this form for <B>" with <A>'s form open makes <B>'s card (COPY_OPEN_FORM_FOR_PERSON_ENABLED)

QA, 8 Nov 2026, found while checking Ask Sunny's round-4 item 3: with <A>'s Coaching Form open, "copy this form for
<B>" made no card here. The answering model replied ("A grounded answer from the policy manual.") and the card stayed
A's. The same turn with nothing open, and "create the same coaching form for <B>" with A's form open, both made B's
card. COPY_OPEN_FORM_FOR_PERSON_ENABLED (default off) reads a same-form copy request that names one roster person
other than the open form's as that person's request for the open template.

Not needed in Ask Sunny: checked on its main 8 Nov 2026 with production's flags plus its flips 7 and 9. The same
wording, with A's form open, already gives B's card and copies A's form at Create. That app's own gap, the card taking
A's salon, is its COPY_OWN_SALON_ENABLED. Here the card takes the store from Woven for its own person.
