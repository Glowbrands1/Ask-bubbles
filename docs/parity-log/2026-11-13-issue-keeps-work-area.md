## 13 Nov 2026: ISSUE_KEEPS_WORK_AREA stays Bubbles-only

QA (13 Nov 2026, low, approved), from the sibling app's 38d live check. "create a ca for <A> at the front desk, she
was rude to a guest" gives a card whose Issue line is only "she was rude to a guest". The request's for-clause is read
as who and where and passed over, and the work area is lost with it. With ISSUE_KEEPS_WORK_AREA_ENABLED (default off)
the work area stays: "she was rude to a guest at the front desk". A store named the same way ("at west dodge") is still
left off. The change is in `forms/incident-issue.ts` (withWorkArea / requestWorkArea); the list is `forms/work-area.ts`,
with this app's own store areas.

Sibling app: not needed. Ask Sunny's card has no Issue line built this way (it has no `incident-issue.ts`); the same
sentence goes to its Observation. There, OBSERVATION_NO_LEADING_NAME (Sunny #939) drops only the leading name and keeps
"at the front desk". Sunny's own `forms/work-area.ts` (#939) lists its salon's areas; the two lists are each app's own.
