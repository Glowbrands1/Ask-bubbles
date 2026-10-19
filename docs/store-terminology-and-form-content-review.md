# Salon → Store terminology, and migrated-form content review

Scope: Ask Bubbles only. Nothing here touches Ask Sunny.

## How the Store wording reaches existing databases

Published template versions are immutable. The wording ships as **new seed revisions**
(`ensureTemplateLibrary`, which runs on the Production deployment when an administrator opens
Forms → Form Templates; refused on Preview/dev by `template-sync-policy.ts`):

| Template | Seed revision | Change |
| --- | --- | --- |
| sdit-epp | 3 → 4 | document, variants, description |
| tsd-epp | 2 → 3 | document, description |
| asd-sdit-epp, fttc-epp | 1 → 2 | document, variants |
| dmit-epp-tsd, dmit-epp-dmit | 1 → 2 | document |
| resignation-exit | 2 → 3 | document |
| prescreen-phone-interview, management-interview-round-2 | 1 → 2 | document |
| tanning-consultant-interview, management-interview-round-1 | 1 → 2 | document, description |
| position-transfer | unchanged | description only — `syncTemplateDisplay` updates the label, no version |

For each, the seeder publishes the Store document as a new version, points the template at it
and **archives** (never edits or deletes) the previous one. Filed forms stay pinned to the
version they were created on, so completed submissions, answers and historical PDFs are
untouched. Field keys (`salon_productivity`, `salon_goals`, `salon_key_returned`, …) are
unchanged. The seeder stands down (reports `heldBack`) for any template with an
administrator-authored version or an open draft.

Read-only check of the Ask Bubbles Supabase project (`dyurgwieyltnhphihwwj`): every template
has a single published version 1, seed revisions equal the code's previous ones, no authored
(`seed_revision = 0`) versions and no drafts, so nothing will be held back. Exactly the 11
templates above contain "salon" in their stored document/variants; the other six (Coaching,
Corrective Action, Policy Review, Follow-Up Coaching, Demotion, example) do not. Only
`coaching` (10) and `dpoa` (13) have filed instances, and neither is re-issued.

## Woven job titles

Woven positions in this deployment (`woven_position_map`): General Manager, Assistant General
Manager, District Manager, Operator, Owner, Team Member Full/Part Time and non-store functions.
There is no "Salon Director" or "Store Director" position. Role and permission mapping comes
from `woven_position_map` / the employee directory by position, not from
`config/company/job-titles.ts`, which only reads job titles a manager *types* into chat. That
file now reads "salon director"/"store director" (and training / in-training / assistant
variants, SD/TSD/SDIT/ASD) equivalently; see `job-titles.test.ts`.

## Content still specific to Sun Tan City / tanning (flagged, NOT changed here)

Needs a business decision from Buff City Soap; no replacement text has been invented.

- **prescreen-phone-interview**: "use our services as part of your Sun Tan City uniform … UV, Sunless and Spa usage" (retained verbatim for review by an earlier approved decision).
- **tanning-consultant-interview**: form name and "Sun Tan City Core Values" heading; "Tanning Consultant" role.
- **management-interview-round-1**: "cleaning beds", "tanning bed they reserved is unavailable" scenario.
- **management-interview-round-2**: "lotions and memberships sales" scenario; "Tanning Consultant" in the training-plan question.
- **resignation-exit**: "Sunlync account … verify tanning has been removed".
- **demotion**: example text "PT Tanning Consultant".
- **fttc-epp**: "full-time Tanning Consultant" description; FTTC/TSD/SDIT/ASD/DMIT role vocabulary.
- **tsd-epp / sdit-epp**: STC KPIs (PPTA, LPSVA, UPTA, Club Close, Average Club Dollar), "SVC".
- **Code vocabulary**: "Tanning Consultant"/"FTTC" in `job-titles.ts`, intake and routing patterns.
- **Titles not recognised**: Woven's "General Manager" / "Assistant General Manager" are not in `COMPANY_JOB_TITLES` (typed text only; pre-existing, not changed).
