# How the person resigned is how they quit, not how the manager reached them (QA's Bubbles round 2, U26)

**Fix (Ask Bubbles):**

- **The model's reading.** The loop's propose_form takes `exit_method`, one of How Employee Resigned's own methods
  (`EXIT_METHOD_LABELS`), and `exit_method_evidence`. It is kept only when the quoted words of this request name that
  method (`quoteNamesMethod`: half the label's words or more, or the line's own reader reads it in the quote). Create
  writes it as the manager's statement after checking the quote in the chat's manager turns.
- **No method from the model.** A loop card's draft reads the method only from the sentences in which the exit form's
  own reader reads a resignation type (`resignationStatementMethod`). It never reads a voicemail someone else left
  earlier in the account.
- **The store.** A former employee whom Woven lists at one store in the manager's scope has that store offered first
  (`employee_store`), as an active person's store is.
- **The rules book.** The card states `how_resigned`, and `exit_ticks` is never said "as you said".

Report: "I want to create an exit form for <P10>. On 11-11-2026 <P11>, General Manager, called and left a voicemail
for <P10> when she did not show for her shift. Later that day <P10> returned the call and told <P1>, Assistant
General Manager, this job was not working out because of her other job and she quit effective immediately." The
form saved "Voicemail", and the card asked "Bellevue or Omaha?" for a former employee whom Woven lists at Omaha West
Dodge only. Replay cases: `nov22-u26-*`.

**Ask Sunny: same gap, port pending.** Sunny's exit-details reader has the same `methodsIn` (Voicemail included) over
the whole account, and its loop has no `exit_method`. Its own-salon offer (`rosterPrimarySalon`) runs only for an active person with
a roster id, so a former employee's salon is not offered first. This session has read access only to Ask Sunny. The
port goes to the Sunny coder through QA, titled `Port from Ask Bubbles (<sha>): …`.
