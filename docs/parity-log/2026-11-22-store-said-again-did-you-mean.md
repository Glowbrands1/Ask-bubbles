# A place the app can't match, said again, gets a "Did you mean" pick of the person's stores (QA's Bubbles re-run, A7) — Bubbles only

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts` (`storeOffer`, `storeSaidBefore`), `places.ts` (`salonStreet`,
`readSalonMentions` with a store index).
- propose_form reads the typed store with the same store index as the regular chat path (`loadStoreIndex`: the
  registered stores plus Woven's names for them where a reviewer mapped them).
- The store offer names each store's street address from the app's own store data (the approved Google store list).
- The same place said again in a later manager turn gets "I can't match "<place>" to a store. Did you mean **A** or
  **B**?" with the person's own Woven stores, instead of the same question. A store is never kept as typed.

Report (person masked): T1 "do verbal for team member <P> at empire, sd. payroll deduct does not apply. previous coaching
jba manual 11-1-26. on 10-22-26 <P> was not scheduled to work and came into the store to show her team her new puppy.
<P> was in the store 45 min" … T5 "store location is empire, sd. create corrective action" — the same "isn't a store
name I know" question every turn, no Create. QA's read of woven_location_map: nothing says "Empire" (the W 41st St
store is "SD Sioux Falls" in Woven), so no data can match the word itself.

**Ask Sunny: not needed.** The typed-store offer is Bubbles-only (from #997, the store-nickname fix); Sunny's loop has no
`typed_store_not_found` offer to repeat.
