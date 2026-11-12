# Bubbles-only: ADDED_DETAIL_KEPT_ENABLED (sf-b6's card half)

Pau via QA, sf-b6 (5 Nov 2026; QA asked for the card half, 10 Nov 2026): after the request for <name>, "can you have
it include that we recieved a customer complaint from Sunday 11-1, she started closing the last register at 4:56pm …",
then "Create a Corrective Action Form from this conversation." — the card showed only the request's issue, and its
turns (what Create hands the draft) were the request and "Create …" alone. This app's card-turn scoping
(`turnsAboutThisForm`, protected) leaves out every turn that reads as a question unless it names the employee, and
"can you have it include that …" opens like one. With the flag, a route post-step puts such a turn back in the card's
turns and shows it on the card ("**Also on the draft:** …").

Not needed in the sibling app (checked on its main 82432371): its scoping has no question filter, and its twin case
(nov5-twin-sf-b6-full-sentence-and-added-detail) already shows the turn-3 detail on the card's Observation and hands
it to the draft.
