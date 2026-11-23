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

**Ask Sunny (main 403c464): the loop has no such check; port needed.** Its agent loop's `propose_form` reads forms on
file only for Prior actions (`finalizedPriorsOnFile`). The regular chat path has a "same incident or a new one?" flow
(`src/lib/forms/draft-actions.ts`, `incidentQuestionAsked` / `readIncidentAnswer`, and `historySaysDifferentIncident` in
the create route), but it reads the reply's and the manager's wording (phrase patterns) and is about reusing a draft, not
a finalized form on file for the same date; the loop never reaches it. The Sunny coder ports the mechanism above
(salon ↔ store wording only; the same template keys through `appConfig().formKeys`).
