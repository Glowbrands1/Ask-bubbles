# Two staff share a first name: the which-one question never stalls (23 Nov 2026, the tester's A9, QA's ruling (b))

**Sibling app: needs checking, not ported in this pull request.** Ask Sunny's loop has the same find_staff branch
(ambiguous_person with no recorded question) and the same answer reader (`confirmed-spelling.ts`). This session has
read-only access to the sibling repository, so QA routes the check and the port. Port the mechanism, not this app's
stores.

A9 (round 1, admin/global): "Create a coaching form." → "Rosalind" (two active Rosalinds at two stores). The which-one
question was right, but the manager answered "yes" and went on with the account. The question came back five times over
8 turns, in full each time, with no card. It also said "I've kept that as the topic" with no card, and used "her" for an
unsettled person.

QA's ruling (b), loop-only:
- find_staff's shared-name branch now records the which-one question (its offered people), so the server knows it is
  open. It gives ask_exactly in full the first time and short when the same people were already asked (`asked_before`).
- `confirmsIn` (`confirmed-spelling.ts`): with several people offered, an answer naming one of them by what only that
  person has confirms that person. That is their surname, or their store (the store reader's reading, or a part of the
  person's own store name, whole words). Read from the people the question offered, never a list of phrasings.
- find_staff returns the picked person as confirmed even when the lookup matched several, so the card is built at once
  with the account from the earlier turns.
- Rules book: the which-one line (kept from the 21 Nov fix) now says no "kept/added/saved" with no card, no pronoun for
  an unsettled person, the short question when asked before, and that a surname, full name or store picks the person.

(a), a person picker on the card, is parked as a product idea for Pau.

Replay: `nov23-agent-loop-same-first-name-no-stall-cases.ts` (the tester's masked names: Rosalind Hartwell at West Dodge,
Rosalind Pike at Bellevue). The surname answer, the store answer and the ignored-question control all fail on origin/main
and pass after. The 21 Nov cases (`nov21-agent-loop-shared-first-name-*`) still pass.
