# NEAR_MISS_ANSWER_KEEPS_REQUEST_ENABLED stays Ask Bubbles only (10 Nov 2026)

**What:** with the roster-name set on, "Oops, it's Rozlyn quellmar" answering "Is this for **Rozlyn Quellmar**?"
became the name alone (the request was looked for by the chosen first name; the manager typed "rozline"), so the
card went back to the earlier Coaching Form and lost its date (s14 path 1, found porting the sibling app's round-22
eval check). Fixed here under NEAR_MISS_ANSWER_KEEPS_REQUEST_ENABLED (`ai/first-name-suggest.ts`).

**Why not in Ask Sunny:** the same chat in Ask Sunny (round 22, ee7e373f, the roster set on) keeps the Follow-Up
Coaching Form request and the date on every turn: its stored form state carries both. Its `answeredNow` has the same
first-name lookup, so the flag ports as is if that state ever stops carrying them.
