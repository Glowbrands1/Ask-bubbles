# The card's store, reworded into its account, goes back once (QA's Bubbles live re-run, A7 follow-up; QA's option 2)

**Root cause (Ask Bubbles):** after #1046 the card is filed at the store the manager named, and the manager's own store
phrase ("at Empire, SD") leaves the account (`withoutNamedSalon`, R13). But the model sometimes rewords the place
mid-sentence ("… came into the store at Empire to show the team the new puppy."). Code strips a place, and the store
reader reads one, only where its whole phrase ends (#869: "at kearney high" is no store), so that stayed.

**Fix (`agent-loop/store-phrase.ts`, `tools.ts`, `run.ts`):** the phrase the store reader matched as the card's store in
the MANAGER's own words, when every manager sentence holding it reads as that store and it is still in what_happened, is
named on propose_form's result (`store_phrase_in_account`), and the reply is handed back once to propose again without it;
if it comes back, the card stays as proposed. A manager who also used the place another way ("she was at kearney high to
show the team …") is never flagged, and that account stays. The store reader decides; no word list.

**Live harness (A7 T1–T5, Sioux Falls manager and admin):** before (main), the admin run's T5 Observation read "… came
into the store at Empire to show …"; after, 14 of 15 turns ended with no store in the account, and the one that kept it
was handed back once, as specified.

**Ask Sunny: same gap, port pending.** Sunny's `withoutNamedSalon` is whole-phrase too and its propose_form says nothing
when the card's salon stays in the account. Read-only here; port through QA (salon for store).
