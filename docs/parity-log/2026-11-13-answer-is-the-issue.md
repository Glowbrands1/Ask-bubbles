## 13 Nov 2026: ANSWER_IS_THE_ISSUE stays Ask Bubbles only

QA's 17t live finding (Bubbles main 7d5b7bb2, item 4): "create corrective action form for <A>, Team Member Part Time"
asked what happened; the answer "she skipped the closing checklist on her shift last night" left "Issue: team member
part time" as the card's What happened. Not a 17t regression: main d5e5ea22 had the title as the Issue on both turns.
The fix (ANSWER_IS_THE_ISSUE_ENABLED, default off, `ai/ca-what-happened.ts`): when the manager's turns give an account
and the card's Issue is only who and where, the Issue is the latest turn that gives one.

Checked on Ask Sunny (main 00e876cc, its production flags, the same two turns with "Tanning Consultant", the pack's
invented Rowan Kestrel): turn 1 asks what happened and the card has no Observation; turn 2's "Observation of Offense" is
"she skipped the closing checklist on her shift last night". Sunny's Corrective Action card has no Issue line and builds
its Observation from the account (`ai/keep-filled-slots.ts`), so the job title never becomes the account there. Not
needed in Ask Sunny.
