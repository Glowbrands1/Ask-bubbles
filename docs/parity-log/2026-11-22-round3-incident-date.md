# The stated incident date reaches the card; a card asking its date has no Create; a copy keeps its form's date (QA's Bubbles live round 3: U09, A1(c), U16)

**Root causes (Ask Bubbles):**

- **U09.** "Verbal CA 11-1-2026. On 11-1-26 Briony violated …": `incidentDates` dropped any date whose day matched a
  prior step's, so the one incident date was lost, the model passed no incident_date and the card was dated today.
- **A1(c).** "late on 10/5 and 10/15" with a prior step on 10/5 read as one date, and a card whose date question was
  still open showed Create.
- **U16.** "create a verbal CA for <P> with all the same information given" copied the form on file's account, but
  the card took no date from that form, so Create saved today's.

**Fix (`tools.ts`):**

- `incidentDates` counts by occurrence: a prior step accounts for one mention of its day; a day the manager wrote more
  times than the prior steps list it is the incident's too.
- When the manager's words state exactly one incident date and propose_form gets none, the card goes back once
  (`incident_date_not_passed`, naming the date). If it still comes back without one, the card asks the date. It never
  uses today silently.
- A card whose date question is open is not Create-ready (`supportsInlineDraft: false`).
- read_form records the form it read (person, form date, account). A card for that person whose account keeps that
  form's account words (4 in 5) takes that form's date, unless the manager's words state any date or the model passed
  one. No word list.

**Ask Sunny: same gaps, port pending.** Sunny's main (9de3675) still drops a same-day date (`incidentDates`), has no
`incident_date_not_passed` hand-back, and its read_form records nothing for a copy. Read-only here; port through QA.
