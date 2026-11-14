## 14 Nov 2026: ISSUE_KEEPS_WORK_AREA keeps a work area said after the store — stays Bubbles-only

QA's 17z-c live check: "write a CA for <A> at Kearney at the front desk, she was rude to a guest" filed Kearney, NE but
the Issue was "she was rude to a guest". The request's place strip (`forms/incident-issue.ts` PLACE, up to four words)
took "at Kearney at the front" and left "desk", so the for-clause no longer read as who and where and the work area was
lost. `requestWorkArea` now also checks the clause with the work-area phrase taken out. Under the same flag
(ISSUE_KEEPS_WORK_AREA_ENABLED, on in production since 17z-c).

Sibling app: not needed, as for ISSUE_KEEPS_WORK_AREA itself (`2026-11-13-issue-keeps-work-area.md`): Ask Sunny's card
has no Issue line built this way; its Observation keeps the manager's words.
