# An open "Which one should I open?" is answered by the manager, never by the model (QA's Bubbles re-run, A11)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/which-form.ts`. A turn whose find_past_forms asked which_form_question
records the listed forms (one-way keys plus the facts that tell them apart: form, status, date, store; no names) in
`slots.agent_loop.which_form`. While that question is open, open_form and edit_form of a listed form need
`choice_evidence`: the manager's words from this message naming a fact only that form has, or its number in the list.
Otherwise nothing is opened or written and the model asks again. The rules-book line from 21 Nov ("Open the most recent
of the forms listed … and make every change on it") is replaced, and the replay case
`nov21-agent-loop-which-one-answered-with-edits-keeps-them` changes on purpose (comment in the case).

Report: T1 "bring up a previously edited corrective action for <P>" (three revised CAs listed), T2 "this is a verbal
warning. previous coaching policy manual 10-15-26" opened a new draft revising a finalized form the manager never
picked and saved Prior actions they never gave.

**Ask Sunny: same gap, port pending.** Sunny's open_form / edit_form have no pick check (no `choice_evidence`), and
its find_past_forms gives the same which_form_question, so a model that picks for the manager is not stopped there
either. Sunny never had the "open the most recent" rules-book line. This session has read access only to Ask Sunny;
the port goes to the Sunny coder through QA, titled `Port from Ask Bubbles (<sha>): …`.
