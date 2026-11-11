# Bubbles-only: POLITE_ABOUT_STAYS_CARD_ENABLED (the sibling app keeps the card)

The Bubbles live tester (QA, 8 Nov 2026; the same with round 4's flags): a Coaching card shown, then "can you make it
for missing out monthly meeting" got a policy answer and no card; without "can you" the card stayed. The turn is not
read as a question; the proposal for it returned nothing. With the flag the polite lead is left off the turn the
proposal reads, and "make it for <topic>" says what the form is about, as "make it about …" does.

Not needed in the sibling app: on its main (ff1e655) with its production flags, and with its round-4 flag file too,
all four wordings ("can you make it for …", "can you make it about …", "make it for …", "make it about …") keep the
Coaching card. Its tester saw the turn miss a card in round 4 against the live model; the pack does not reproduce it.
