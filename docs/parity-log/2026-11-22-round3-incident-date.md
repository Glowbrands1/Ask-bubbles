# The stated incident date reaches the card; a card asking its date has no Create; a copy keeps its form's date (QA's Bubbles live round 3: U09, A1(c), U16, U21's dates)

**Root causes (Ask Bubbles):**

- **U09.** "Verbal CA 11-1-2026. On 11-1-26 Briony violated …": `incidentDates` dropped any date whose day matched a
  prior step's, so the one incident date was lost, the model passed no incident_date and the card was dated today.
- **A1(c).** "late on 10/5 and 10/15" with a prior step on 10/5 read as one date, and a card whose date question was
  still open showed Create.
- **U16.** "create a verbal CA for <P> with all the same information given" copied the form on file's account, but
  the card took no date from that form, so Create saved today's. Live (on main too), the model often looked the form up
  again with find_past_forms open: true, and propose_form then refused the copy (`open_requested`), so no card at all.
- **U21 (dates).** The model passed a prior step's date as incident_date: 9/22, the earlier coaching (typed "recieved
  coaching on 9/22", which the prior-step reading missed; that turn's prior_actions listed only the 5/26 step), and
  6/24/24, the day the policies were signed (the check compared 06-24 of this year, losing the written year).

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
- The `open_requested` refusal gives way when the manager's own words in this message ask for a new form (verified
  new_form_evidence); a lookup the model made is not the manager's request. The rules book's copy line says to look the
  form up without open and to pass new_form_evidence.
- `prior-step-dates.ts` (shared with the Observation's prior-step pass): a prior step's dates keep the year written, and
  this person's earlier cards' prior-action dates count too (the card record's `priorDates`, ISO dates only, never
  text). A model incident_date that is a prior step's date goes back once (`date_is_prior_step`, naming the step), so
  the reply asks which day this happened; if it comes back with that date again, the date is left off.

**Ask Sunny: same gaps, port pending.** Sunny's main (9de3675) still drops a same-day date (`incidentDates`), has no
`incident_date_not_passed` hand-back, its read_form records nothing for a copy, and its `open_requested` refusal
does not read new_form_evidence; its prior-date check also drops the written year and has no record of earlier
cards' steps. Read-only here; port through QA.
