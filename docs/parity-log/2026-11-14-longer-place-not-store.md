# A city inside a longer place is not the store (guards only)

**Change in Ask Sunny.** QA's Sunny 38h live check: "at kearney high", "at the kearney mall", "at lincoln high", "at omaha
west" were filed at that city's salon, unasked (Ask Sunny #975, #977: REASON_PLACE_NOT_SALON, FUZZY_SALON_ASKS).

**Ask Bubbles: not needed (guards added).** Checked on main 65b7951d (17z, production flags, Admin covering every
store, invented off-roster person): "at bellevue high", "at kearney high", "at the kearney mall" and "…because she was at
kearney high of all places" name no store, and the reply's "won't name one" agrees with the card. "at kearney" and "at
the kearney store" are filed at Kearney, NE. QA (14 Nov 2026): naming no store is safe, no new ask. The replay pack
keeps all six (`nov14-longer-place-not-store-guards-cases.ts`).
