# A card for an incident already on file is asked about, and waits (Pau's review of Ask Sunny's chats, 23 Nov 2026, via QA)

**Report:** an employee had two FINALIZED Corrective Actions for one incident date (a no-show on 11/18) and a third draft;
the AI never said one already existed.

**Fix (Ask Bubbles, agent loop):** `propose_form` (`src/lib/ai/agent-loop/tools.ts`): for a Corrective Action or Coaching
card whose person (roster id) already has that form on file for the card's incident date (`sameDayFormsOnFile`: the
forms this manager may open, drafts and finalized, not archived or revised, the open form excepted), no card is made. The
reply ends with the app's own question (`sameDayOnFileQuestion`): "<P> already has a Corrective Action for 11/18
(finalized 11/19). Do you want to open that one, or is this a separate incident?". The manager's words that it is a
separate incident (`separate_incident_evidence`, a quote of this request) build the card; a card already on screen for
that person, form and date is not asked again. The question writes a `same_incident` record (`card-record.ts`) so the
next turn's request starts at the message it answered. No word lists: the forms on file and the date decide.
Cases: `nov23-agent-loop-same-incident-on-file-cases.ts` (the finalized and draft cases fail on main; the other-date
control and the separate-incident answer pass).

**Copies (QA's ruling (B), 24 Nov 2026 PHT):** a copy for the SAME person with the SAME incident date as a form on file
is that duplicate, so it asks first too; a copy for another person or with another date is never asked. The U16 copy
cases answer "it's a separate incident" before checking the copy (CHANGED ON PURPOSE, in
`nov22-agent-loop-u16-open-existing-ca-cases.ts`).

**Ask Sunny (main 403c464): port needed, in the loop (QA: Sunny coder 2).** Its agent loop's `propose_form` reads forms
on file only for Prior actions (`finalizedPriorsOnFile`). The regular chat path's "same incident or a new one?" flow
(`src/lib/forms/draft-actions.ts`, `incidentQuestionAsked` / `readIncidentAnswer`, and `historySaysDifferentIncident` in
the create route) reads wording patterns and is about reusing a draft, not a form on file for the same date; the loop
never reaches it. Port the same names: `sameDayFormsOnFile`, `sameDayOnFileQuestion`, reason_code
`same_incident_on_file`, the input `separate_incident_evidence`, the record `slots.agent_loop.same_incident`
(`SameIncidentSlot` / `SameIncidentRecord`, `sameIncidentRecords` on the tool context, a request start in
`requestStarts`), and the rules-book line. Salon ↔ store wording only; the template keys through `appConfig().formKeys`.

**QA's live check of #1123 (24 Nov 2026):** the live model's copy card had no date, so the check had nothing to compare.
Two more gates, ported with the rest: (2) a card with no date of its own, made in a turn that read this person's form of
the same kind on file (read_form), is checked against that form's date; (1) Create, the last gate
(`src/app/api/forms/instances/route.ts`), holds a loop card when this person has that form on file for the date it would
be saved with (a form filed since the card was made counts) unless the manager said that date is a separate incident
(the card record's `sameIncidentChecked`), with the same question (409, code `same_incident_on_file`). The shared lookup
and question are `src/lib/forms/same-incident.ts` (`formsOnFileSameDay`, `sameDayOnFileQuestion`).
