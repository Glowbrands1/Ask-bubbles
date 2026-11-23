# An exit card for a person with an exit form on file is not made; the exit card keeps how the person left (port of Ask Sunny #1294) — ported

**Report (Ask Sunny; its QA, 23 Nov 2026, Pau's review of a live chat):**
- An assistant manager asked to edit <P>'s exit form for HR and was told none was on file, though a finalized one from 11/20 was.
- She said "make  an exit form then", and <P> got a second exit form with HR's edits on the new draft.
- "How did <P> leave …?" was then asked twice, after "effective immediately".

**Ask Bubbles: same gaps.** Bubbles main 72404b3 had no exit-on-file check in `propose_form`, and no exit type on the card record.

**Port (the mechanism, code only; store for salon, Forms Register for Form Monitoring, Bubbles' Resignation/Exit Form):**
- **Exit form on file:** `propose_form` for the exit form first reads this person's exit forms on file that the manager can see, the same way find_past_forms reads them.
  - With one on file, no card is made: `reason_code: "exit_on_file"`, the forms (status, date, store), and an `ask_exactly` offering to open it (a revision) or start a new one.
  - It is asked once; the manager's answer decides.
  - The same person's exit card already on screen is never asked.
- **How the person left:** the card record keeps the exit card's resignation type (`CardRecord.exitType`, an option key of the form). The same person's exit card proposed again keeps it.
- No word list: the forms on file, the card record and the form's own option keys.

**Tests:** the replay cases `nov23-port-exit-*` use Sunny's turns verbatim, with invented names and a store manager at West Dodge.
- (b) "make  an exit form then" makes no card or form: fails before, passes after.
- (b) a new card is made only after the manager answers: fails before, passes after.
- (c) T1 → T2 → T3 keeps how she left: fails before, passes after.
- (a) the edit request lists the finalized exit form, and the control (no exit form on file) makes the card. Both pass before and after.

**Root cause: open.** QA has ruled out the assistant-manager flag theory: `NEXT_PUBLIC_ASSISTANT_MANAGER_CREATE_ENABLED` is
"true" in production in both apps. This guard prevents the duplicate regardless.
