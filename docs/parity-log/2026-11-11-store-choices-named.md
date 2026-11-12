## 11 Nov 2026: STORE_CHOICES_NAMED_ENABLED — Ask Bubbles only

**Not needed in Ask Sunny: it already names the choices.**

Problem 20 (this app's production, 10 Nov 2026). A manager covering two stores named a person who works at both stores
in Woven. The reply was "I won't choose which store this belongs to. Which store is this about?" with no store named.
Sent again, the request got the same question back under "I still need to know which location this is about…", and
no card was made. With STORE_CHOICES_NAMED_ENABLED, the question names the person's stores from Woven (or the manager's
own stores) (`forms/store-choices-named.ts`).

Ask Sunny, checked with the same conversation in its replay pack on production's flags: the card waiting for its salon
already lists the salons as numbered choices ("1. **<salon>** 2. **<salon>**") and keeps the manager's account as the
Observation. That is `holdFilledSlots` (`ai/keep-filled-slots.ts`, INTENT_EXTRACTION / GROUNDED_ENTITIES), which this
app does not have. No port; the ported draft stays unopened on Ask Sunny's `claude/store-choices-named-wip`.
