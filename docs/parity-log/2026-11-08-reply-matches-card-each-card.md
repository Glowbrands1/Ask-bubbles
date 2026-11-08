# Bubbles-only: REPLY_MATCHES_CARD_EACH_CARD_ENABLED (the sibling app never shows two cards in one reply)

QA's round-6 flag audit (8 Nov 2026): live here, no code in the sibling app. QA's tester (5 Nov 2026, item 6 "two
forms"): with two cards in one reply, REPLY_MATCHES_CARD rewrote the second form's person to the first card's.

Not needed in the sibling app: it never puts two cards in one reply. TWO_FORMS_OWN_PERSON (live there) makes one card
and offers the second person's form on its own turn. Checked on its main (0ae7b2e) with its production flags: "I need
a coaching form for <A> … and a CA for <B> …" gives no card and asks which person is meant. That is its own open
replay case `nov7-two-forms-each-person-*` (TWO_FORMS_EACH_PERSON), which makes the second form an offer, not a
card. If the sibling app ever shows two cards in one reply, this flag is to be ported with it.
