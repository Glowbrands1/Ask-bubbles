# Port: "yes" to the loop's own "open <P>'s form on file?" is asking for <P>'s forms (22 Nov 2026)

**Ported from Ask Sunny `bca3bca` (#1219, its QA's shadow re-run S1(b)).** Mechanism only: the same
`formsOnFileAskedFor` person check in `src/lib/ai/agent-loop/tools.ts`.

An answer that names nobody counted only an earlier manager turn that named the person; the app's own question was never
read. Now, when the quoted answer names nobody and the app's reply right before it names this person, the answer is about
them. An answer that names someone else is still that person's, and a "yes" never opens another person's forms.

Replay: `nov22-agent-loop-yes-to-own-forms-question-cases.ts` (invented Fenna Prewitt and Ozren Brack, `LOOP_STAFF`).
"yes" and "yes please" fail before the fix and pass after; the control (the model asks for Ozren's forms after "yes")
is refused.

Open, same as the sibling: in one live run here the model found the form by date, asked "… for Fenna Prewitt … Is that
the one you mean?", and "yes please" was still refused. The tool input was not recorded; the likely path is the model
citing the manager's earlier request (which names nobody) instead of the "yes". Reported to QA as a follow-up.
