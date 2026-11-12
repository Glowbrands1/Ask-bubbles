# Gate-Bubbles-4: #822 RESENT_REQUEST_IS_YES_ENABLED with #817 TERMINATION_INTAKE_ENABLED, heads 99c7010a + 88c8d01e: GO (the 17p pair)
- Base main c88676a (production env from its production-flags.json). #822 and #817 merged together. Conflicts: chat-quality-flags.ts (kept both, verifyfns 0) and template-intent.ts (#698's PASTED_FORM_NAME block next to #817's TERMINATION_LETTER, and the import line: kept both). tsc clean.
- Arms as QA asked: OFF = production; ON = production + RESENT_REQUEST_IS_YES + TERMINATION_INTAKE. 1 OFF + 1 ON.
- 14038 tests. Changed 31: INTENDED 8, INTENDED-ADJACENT 22, INTENDED-HARNESS 1, REGRESSION 0.
- 29 rows are #817's rows (G4-817), with the same replies as #817 alone except one: nov9-letter-greeting-hi-first-name (both arms). On T2 (the request resent after "Is this for **Marcus Tellefsen**?"), the reply is now "Here's what I'll fill in on the **Resignation/Exit Form** for **Marcus Tellefsen**" with Name, Job Title and Store. #817 alone gave "Who is this Resignation/Exit Form for?". Marcus is kept on the resend.
- #822's own OPEN case nov12-resent-exit-request-keeps-name holds (OFF: "the name was lost").
- OPEN cases that now hold: nov12-resent-exit-request-keeps-name, nov12-termination-ca-bare-opens-card, nov12-17k-termination-letter-exit-card.
