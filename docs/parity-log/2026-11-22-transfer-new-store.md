# A transfer's new store is on the card and the saved form (QA's Bubbles round 2, U54)

**Fix (Ask Bubbles):** `src/lib/forms/transfer-new-store.ts`. The loop's propose_form takes `new_store`, the store
the person is moving to as the manager named it, and `new_store_evidence`, the manager's words for it from this
request. Both are kept only on that evidence. The words are read through the Woven-aware store index
(`loadStoreIndex`: the roster, the company's nicknames, and the Woven names a person mapped in `woven_location_map`).
The read must give exactly one store and never an inferred spelling. Otherwise the result carries
`new_store_not_found` with an `ask_exactly` question.

The card states "New store", and Create writes New Location as the manager's statement. Before writing, the forms
route checks that the quote is in the chat's manager turns and holds the words, and it reads the words again
server-side. There is a rules-book line for the transfer card. The replay harness gains `t.wovenStoreNames` (Woven's
own store names, by store id).

Report: T2 "create transfer form for <P>", T3 "<P> is PT at 15/hr and wants to transfer to dawley effective 11-2-26".
The saved form had the pay, the status and the date, but no New Location. Woven calls the E 18th St store "SD Dawley
Farms". The employment-change reader reads registered names only. Replay cases: `nov22-u54-*`.

**Ask Sunny: same gap, port pending.** Sunny's loop propose_form has no new-salon field. Its employment-change reader
(`employment-change.ts`, `salon-text.ts`) reads registered salon names only, so a transfer to a salon named any other
way is lost there too. Sunny has no Woven store-alias index (`lib/stores/woven-aliases.ts` is Bubbles-only). The port
carries the mechanism (`new_salon` + evidence, Create's server-side check) and reads the salon with Sunny's own salon
reader. This session has read access only to Ask Sunny, so the port goes to the Sunny coder through QA, titled
`Port from Ask Bubbles (<sha>): …`.
