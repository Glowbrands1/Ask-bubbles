## 7 Nov 2026: SECOND_REQUEST_OWN_ACCOUNT_ENABLED, ported for parity (inert here)

QA's audit found in the sibling app that a second Corrective Action for the same person in one chat reopened the
first draft (DRAFT_DEDUPE's lookup read every turn of the chat as the incident), and that a second form carried the
first request's policy. This app has the same reopen code (`ai/grounded-turn.ts` reopenSameIncident), but
DRAFT_DEDUPE_ENABLED is not set in this app's production (QA's Vercel read, 7 Nov 2026), so the reopen cannot happen
here today, and replay shows no policy carry-over. The mechanism is ported behind the same default-off flag:
`forms/current-request.ts`, the reopen lookup, the draft route's policy reads and `ai/form-state.ts`. The sibling's
card-policy fix in its `ai/form-proposal.ts` waits on Pau there and is not needed here.
