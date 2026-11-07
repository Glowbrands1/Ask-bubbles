# Bubbles-only: the Dawley Farms store's number (District Manager, 3 Nov 2026)

A District Manager reported that on Google Reviews the two South Dakota stores have the same name and the Dawley store has the wrong store number. The company numbers it 0309. Its Google Business Profile lists code 338, which is also this app's location id (loc-338).

The fix adds the company's own store number beside the code (`companyNumber` in `config/company/google-reviews.ts` and `config/company/locations.ts`). Managers see 309 on the Reviews page, the admin Google Reviews screen and in chat ("(Store 309)"), and "store 309" finds the store. Google matching and every stored id still use 338.

Not needed in the sibling app: it has none of these stores, and its store codes are its company numbers. The mechanism is data-driven (an optional field), so the sibling app would need nothing until a store there is numbered differently from its code.
