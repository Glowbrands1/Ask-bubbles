# A later turn never rewrites the Observation unless the manager changes it (QA's Bubbles live re-run, A7 T5; QA's option 2)

**Root cause (Ask Bubbles):** the tester's A7 T5, "store location is empire, sd. create corrective action", rebuilt the
card on screen, and the model's account replaced the Observation: "<P> is a team member. On 10/22/26 …" (the request's
role line put into the account), and in other runs only its punctuation changed. T5 asked for no new account. Only a
reword request ("make it more professional") was paused (Batch G0); any other rebuild took the model's account as given.

**Fix (`agent-loop/account-kept.ts`, `tools.ts`, `card-record.ts`, `run.ts`):** a rebuild of the card on screen keeps the
account as shown when the model's account differs only in ways the manager's latest message does not bring: a word the
new account adds or drops must be one the manager wrote in that message ("she was in the store 30 min, not 45" changes
it; a role line or a comma does not). The account on screen is read from the last reply's Observation line only when it
is exactly what the card showed: the card's server record now holds a one-way key of the shown account (`issueKey`,
`shownTextKey`), never its text. Within a turn, this turn's own card is the account on screen; dropping a store phrase
the app itself handed back (`storePhraseLeft`) is allowed. propose_form says `account_kept_as_shown`. Words compared as
words; no phrase list.

**Tests:** replay cases `nov22-a7-t5-role-line-not-put-in-observation` and `nov22-a7-t5-punctuation-rewrite-not-taken`
(T1–T5 verbatim) fail before and pass after; the control `nov22-a7-t5-control-manager-change-is-taken` passes both ways.
Unit test `account-kept.test.ts`.

**Ask Sunny: same gap, port pending.** Sunny main daa2b3c pauses only a reword request (`REWORD_REQUEST`) and takes any
other rebuild's account as the model gives it; its card record has no key of the shown account. Read-only here; port
through QA (salon for store).
