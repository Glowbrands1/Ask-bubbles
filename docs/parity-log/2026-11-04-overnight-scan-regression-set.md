## 4 Nov 2026: QA's overnight scan — 11 replay cases in both apps, where the apps differ

Test-only, no flag (`src/app/api/chat/replay-pack/nov4-overnight-scan-cases.ts`
in both apps, the same ids). The same eleven chats, each app in its own
setting: stores here, salons in the sibling app; this app's own product
("Bath Bomb Kits") and invented neutral metric names where the sibling
chat named its own; sf-b5 is this app's chat, run in both.

Where the result differs today (production flags):

- sf-s14 (team coaching at a store outside the manager's scope) holds here —
  the card waits for a store and says the manager cannot file against Grand
  Island — and is OPEN in the sibling app, which makes the card for the other
  location without asking.
- sf-s11, sf-s15: here turn 3 / the request is answered as a policy question
  (no card); in the sibling app turn 3 edits the first card and sf-s15 cites
  Standards of Conduct instead of Care and Cleaning.
- sf-s12, sf-s13, sf-b5: here the abbreviation, the product and the typed name
  are looked up on the roster ("I couldn't find … in the Woven roster"); in
  the sibling app they become the card's employee as typed.
- sf-s16: this app's card names the section only (no page); the sibling
  app's case also checks p.12 on the card.
- sf-s17, sf-s19, sf-b5: here the warning level the manager named is read as
  earlier history and asked again; the sibling app keeps it.
- sf-s18 holds in both apps.
