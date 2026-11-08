# Bubbles-only: the account after a request's sales reason is the Issue (ISSUE_AFTER_REQUEST_REASON_ENABLED)

QA's round-5 Bubbles check (8 Nov 2026), from the sibling app's history 1143df48: "I need a corrective action for under
performance. <A> was below on …" printed "**Issue:** under performance" (the request's reason; the account lost), and
"… made for under performance. <A> was below on …" printed the whole message as the Issue. With the flag on,
`forms/incident-issue.ts` reads a request whose for-clause (after "made / done / written up …" too) is only a sales
reason (`ca-policy.ts` isSalesPolicyReading, no stated offense) as no Issue of its own and no account: the account
sentence after it is the Issue. Alone, the reason stays the Issue.

Not needed in the sibling app as this change: its card has no Issue line. The same two messages there showed on the
card's Observation of Offense ("under performance. <A> was below …", "made for under performance. <A> was below …"),
and its REQUEST_PARTICIPLE_LEAD_ENABLED (Glowbrands1/ask-sunny#651) makes both start at the account.
