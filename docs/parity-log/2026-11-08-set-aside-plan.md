# Bubbles-only: POLICY_SET_ASIDE_PLAN_ENABLED (the sibling app's card already rebuilds its plan)

The Bubbles live tester (QA, 8 Nov 2026, round 5 on): "CA for <A> she was late today", then "take the attendance
policy off the form": the card said "**Policy:** none — you took the Attendance policy off", and its Action plan still
said "Management will review the Attendance policy with <A>". New with round 5 (PROPOSAL_POLICY_SET_ASIDE and
TAKE_OFF_STAYS_CARD went on). With the flag the plan names no policy that was taken off.

Not needed in the sibling app: checked on its main (ff1e655) with its production flags, the same two turns give
"**Policy:** none — you took the Attendance policy off …" and "**Action Plan:** Management will review the applicable
company policy with <A>": its card builds the plan from the policies left on it.
