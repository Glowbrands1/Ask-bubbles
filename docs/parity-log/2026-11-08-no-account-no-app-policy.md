# Not needed here: no policy "read from this request" beside "You haven't told me what happened yet" (the sibling app's NO_ACCOUNT_NO_APP_POLICY_ENABLED)

The sibling app's flip-9 live tester (QA, 8 Nov 2026): "ca for <A> not late" asked "You haven't told me what happened
yet" and, beside it, said "**Policy:** Attendance — read from this request" — AS_YOU_SAID_APP_READ's reading of the
app's own policy line, for a fault the manager denied. Its fix (NO_ACCOUNT_NO_APP_POLICY_ENABLED) drops that line from
a Corrective Action card that asks what happened.

Not needed in this app: checked on main 8 Nov 2026 with production's flags plus flips 6 and 8 (AS_YOU_SAID_APP_READ and
DENIAL_NO_ACCOUNT on), the same wording asks what happened with no Policy line read from the request, and the Action
plan names "the applicable company policy". A guard case is in the replay pack (`nov8-sunny-round4-guards-cases.ts`).
