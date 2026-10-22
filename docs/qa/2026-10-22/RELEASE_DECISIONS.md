# Release decisions — Ask Bubbles full release (owner, 22 Oct 2026)

| # | Decision | Where it is enforced |
|---|---|---|
| 1 | Keep district-manager restrictions until assignments are verified | `src/app/api/forms/location-authority.test.ts`, `src/lib/forms/employee-roster-area.test.ts` (fail-closed, unchanged) |
| 2 | Keep employee names exactly as entered, no automatic capitalisation (reverses the 9 Oct rule in `owner-retest-e2e.test.ts`) | `src/app/api/forms/qa-w2-employee-e2e.test.ts` |
| 3 | A store number two systems disagree on is asked, never guessed (already the behaviour) | `src/lib/ai/store-woven-form-flow.test.ts` |
| 4 | R1 (lower-case name in "what should I do?") and N5 (an admin's bare "264") left for a separate update | not in this release |
