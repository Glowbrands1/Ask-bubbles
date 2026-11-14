## 14 Nov 2026: UNFOUND_POLICY_GIVES_WAY_TO_ACCOUNT stays Bubbles-only

QA's Bubbles 17y live test: "create a CA for <A> for violating the pet grooming policy, she was late on 11/3/26" gave
the card's Issue "violating the pet grooming policy"; the lateness she stated was dropped. This app's card Issue reads
the request's for-clause first (`forms/incident-issue.ts`, `issueFromRequest`), and a policy the manual lacks counted
as the account.

Ask Sunny's card has no Issue. Checked on its main (9abd3d4, 38g) with the replay harness, the same three turns: the
card's Observation is "violating the pet grooming policy, she was late on 11/3/26", "she was late on 11/3/26 and
violated the pet grooming policy" and "she was late on 11/3/26, pet grooming policy": the lateness is never dropped.
Not needed there.

Left in both apps (not this flag): with the policy only named, the card's Policy line says the manual has no section
for it and does not offer Attendance for the lateness (`forms/ca-policy.ts`).
