## 11 Nov 2026: Ask Sunny's `holdFilledSlots` (`ai/keep-filled-slots.ts`) — not ported to this app (parked)

**Parked by QA (11 Nov 2026): a release-sized port; not needed for Problem 20.**

While fixing Problem 20 (#769, STORE_CHOICES_NAMED), the same conversation was replayed in Ask Sunny on production's
flags. There, a card waiting for its salon already lists the salons as numbered choices ("1. **<salon>** 2.
**<salon>**") and keeps the manager's account as the card's Observation. Both come from Sunny's `holdFilledSlots`
(`ai/keep-filled-slots.ts`), which this app does not have.

Why it is not ported:

- **Size.** 937 lines, about 45 imports and about 30 flags. About 20 of its imports have no module in this app. A few are
  renames (salons → stores, salon-mention, salon-cue). Most are Sunny-only readers: account-clauses,
  observation-own-person, payroll-clause-not-account, ca-what-happened, new-request-own-date, place-state,
  newest-place-turn, corrected-incident-date, explicit-incident-date, amount-answer, roster-validated-name,
  asks-to-the-app, app-instructions, chat-glossary and roster-reply.
- **Path.** It is called only from `grounded-turn.ts`, and does its slot work only with INTENT_EXTRACTION or
  GROUNDED_ENTITIES on. Both are on in Ask Sunny's production and off in this app's. Porting it faithfully means turning
  on this app's grounded path, a change to the production card path that needs its own release plan.
- **Need.** Problem 20 is fixed by STORE_CHOICES_NAMED_ENABLED (the store question names the stores). A numbered list and
  a visible Observation line on the waiting card wait for a manager's report.
