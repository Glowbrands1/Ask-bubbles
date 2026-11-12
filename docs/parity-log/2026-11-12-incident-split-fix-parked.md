## 12 Nov 2026: INCIDENT_SPLIT_FIX parked (#767)

`INCIDENT_SPLIT_FIX_ENABLED` is parked, not merged. Gate-Bubbles-3's
classification (R767, on `claude/gate-bubbles-3-records`) found 49 regressions
against the 4 cases it was built for (`nov10-incident-split-cases.ts`):

- An account given before the request loses its Issue, including Pau's 11
  Coaching-to-CA phrasings.
- The place lead ("at West Dodge Rd for …") comes back.
- Outline, correction, history and action-plan text enter the Issue.
- The manager's own words are changed: an "and" is dropped from a list, and
  "not hitting his goals" is cut.

QA's options were to narrow the flag to exactly the 4 cases' shapes, with every
R767 regression as a guard, or to park it. `splitFixedIssue` replaces the whole
Issue reader (226 lines), and the regressions cover many different input shapes,
so narrowing it would be a rewrite. It is parked instead.

The 4 reported shapes stay open. A narrow fix for them should start from main's
reader, not from this one, and should carry R767's regression rows as guards.

Ask Sunny: the sibling's twin (S#257, `claude/incident-split-fix-rebuild`) uses
a different mechanism and was not part of R767; this note does not decide it.
