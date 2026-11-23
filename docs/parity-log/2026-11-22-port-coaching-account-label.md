# Port: a Coaching card's account is labelled with the form's own label (22 Nov 2026)

**Ported from Ask Sunny #1241 (cd69c6c, its 266-chat run's cases 039 and 241).** Mechanism only. Ask Sunny's own parity
entry is `docs/parity-log/2026-11-22-coaching-account-label.md` on its branch; this app had the identical rules-book line
at main 1e58cd6.

A Coaching Form card read "**Observation of Offense:** …", a Corrective Action's label on a form whose field is "Details
of Coaching". The rules book gave every incident card the label "Observation of Offense".

Now propose_form's card (and the team Coaching card) carries `account_label`, the label of the form's own account field
(`observation` or `coaching_details`) read from its template, and the rules-book line writes `**<card.account_label>:**`.
This app has no rules-book fixture files, so there is nothing to re-take.

Replay: `nov22-agent-loop-coaching-account-label-cases.ts` (invented Fenna Prewitt, `LOOP_STAFF`). The coaching case and
the CA control fail on origin/main and pass after.
