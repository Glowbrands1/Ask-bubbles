# FORM_NAME_FROM_ROSTER_ENABLED: which tests it changes, and why

**To follow.** The classification run (`node scripts/flag-classify.ts --flag FORM_NAME_FROM_ROSTER_ENABLED --runs 3 src/lib/ai src/lib/forms src/app/api/chat src/app/api/forms`) was not run on this branch: the machine was loaded. It is to be run before the flag goes on, and this file replaced with its table.

What the flag does (step 5's first piece; overnight scan sf-s19, "metrics read as people"; Pau, 4 Nov 2026): with the actor's roster, a name candidate that matches nobody exactly or closely and is shaped like nobody on it (`src/lib/forms/roster-shape.ts`) is not a name. The grounding step leaves it in the question (no strip, no "I couldn't find … in the Woven roster", no cleared card employee), and the name reader drops it when the person guard's roster is read (PERSON_GUARD_ENABLED), so it is never the card's employee. Needs CA_SALES_POLICY_ENABLED: off unless both are on.

Known, from the replay pack with the flag on:

- `nov4-pau-metrics-not-people` holds with FORM_NAME_FROM_ROSTER_ENABLED and CA_SALES_POLICY_ENABLED on (OPEN in production).
- `nov4-scan-sf-s19-corrective-action-answer`: turn 1 no longer names the metrics as people and cites the Standards of Conduct; the case still fails for its own other reasons (turn 2 "Corrective Action" repeats turn 1 word for word; Verbal or Written is asked though she said verbal). Not in its fixFlags.
- The trade-off: a full name whose first word is nobody's first name on the roster ("Zuleika Brightwell") is no longer announced as missing from the roster. Pinned in `src/lib/forms/form-name-from-roster.test.ts`; decision pending.
