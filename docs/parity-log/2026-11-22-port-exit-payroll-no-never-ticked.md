# Port: an exit card with payroll "No" never says payroll deduction is ticked (22 Nov 2026)

**Ported from Ask Sunny #1240 (dbdf343, its 266-chat run's case 036).** Mechanism only. Ask Sunny's own parity entry is
`docs/parity-log/2026-11-22-exit-payroll-no-never-ticked.md` on its branch; this app had the identical fact and line
at main 1e58cd6.

propose_form's `payroll_question_only` fact (a form that asks payroll only as Yes / No) fired for any payroll answer,
"no" included, without saying the answer. The rules book told the model to say deduction "is ticked as the manager
said". In the sibling's run, the reply read "No, as you said." and then "Payroll deduction is ticked as you said".

Now the fact leads with the card's own answer ("Payroll deduction on the card: Yes / No / not set."). The rules-book line
has the model say that answer, never "ticked" for a No, and gives the amount line only when there is an amount or a
reason. This app has no rules-book fixture files, so there is nothing to re-take.

Replay: `nov22-agent-loop-exit-payroll-no-never-ticked-cases.ts` (invented Thaddea Kroll, `LOOP_STAFF`, West Dodge). The
No case and the Yes control fail on origin/main and pass after.
