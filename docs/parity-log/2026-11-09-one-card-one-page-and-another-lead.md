# Sibling app only: one card cites one page (ONE_CARD_ONE_PAGE_ENABLED), and "I need another corrective action for <P>, …" is not the account (ANOTHER_REQUEST_LEAD_ENABLED)

The sibling app's round-9 live check (9 Nov 2026; the person invented):

1. A CA card for "left the front desk unattended" or "cash drawer was short" read "**Standards of Conduct** (page 13)" over a citation line "Standards of Conduct Policy, JBA Policy Manual p.12". The citation line came from the slot model's saved heading, at the heading's own page. The Coaching card printed p.13 and p.12. The fix there: the citation line takes the page the card already gives that section, and a card whose Policy line names a section with its page gets the line.
2. "I need another corrective action for <P>, his cash drawer was short $20 on 11/3" became the card's whole Observation, because "another" was not read as part of the request. The fix there: "another", "one more" and "a second / separate / different / new" before the form are read as part of the request.

Neither is needed in this app, checked on main 48a3353f through the replay pack (the slot model scripted to read "Standards of Conduct", as the sibling's live card shows):

1. This app's card has no step that prints the saved heading as a citation line (the sibling's `ai/form-card-slots.ts` fieldLines / statedPolicy). Its CA cards read "**Policy:** this reads as **Standards of Conduct** — cash handling" with no second line, with or without the model's heading, so a card cannot show two pages.
2. This app's account reader already reads "I need another corrective action for <A>, …" and "now make a separate CA for <A> …" as the request (`ai/remap-incident.ts`). The card's Issue for both wordings is "his cash drawer was short $20 on 11/3" or "his cash drawer being short $20 on 11/3".
