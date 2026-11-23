# Board f140: Create never saves a form with no store while the card asks which store (22 Nov 2026, QA's round 2)

**Sibling app: needs checking, not ported in this pull request.** Ask Sunny shares `createInlineForm` and the loop's
store paths (salon ↔ store). Read-only access here; QA routes the check and the port. Port the mechanism, not this app's
stores.

1. **The card's store from Woven** (`agent-loop/tools.ts`). A store manager's card read only Woven's PRIMARY store
   (`rosterPrimarySalon`), which a directory row can lack, and asked "Which store?". An admin's card never looked. Both
   now read the person's Woven stores as U29 does (`wovenStoresOf`: the primary first, then the roster's stores).
   Exactly one among the login's stores is the card's store (store_from_woven); several still ask. An admin gets the
   one-store fill only, with no new question.
2. **Create on a card that still asks** (`features/chat/create-inline-form.ts`). A card can be "ready" while its store
   is open (locationResolution "needs_selection", or status "needs_location"), and the browser's Create posted
   locationId null, which the server saved. Create now refuses such a card before any request. It gives the card's
   question in one line ("Which store is this about? Choose the store on the card, then press Create.") and saves
   nothing. The regular (non-loop) chat's cards go through the same function, so they had the same gap and get the same
   fix.

Replay: `nov22-agent-loop-f140-one-woven-store-cases.ts` (the tester's R01 and U06 verbatim, invented people). Unit:
`create-inline-form.test.ts` (f140 block).
