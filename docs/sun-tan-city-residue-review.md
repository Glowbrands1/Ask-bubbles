# Sun Tan City residue review

Scope: Ask Bubbles (Buff City Soap) only. Ask Sunny was not modified. The user-facing term
"Store" is kept everywhere; nothing here proposes a global rename. Line numbers are as of
the branch this file was added on.

Evidence used for Buff City Soap: `docs/store-terminology-and-form-content-review.md`
("Woven job titles": General Manager, Assistant General Manager, District Manager, Operator,
Owner, Team Member Full/Part Time, non-store functions; no Salon/Store Director position),
`src/config/company/job-titles.test.ts` (Woven names "Team Member Full Time/Part Time",
"District Manager"), `src/config/company/*`, `docs/chat-parity.md`.

## A. Changed now (evidence-backed, wording only, no behavior change)

| File | Was | Now | Evidence |
|---|---|---|---|
| `src/lib/ai/form-proposal.ts` (demotion intake example shown to managers) | "Jane Doe, Store Director FT … → Tanning Consultant PT …" | "Jane Doe, Assistant General Manager FT … → Team Member PT …" | Woven positions list above. Title parsing keeps titles as typed, so the form values follow the example (tests updated in `employment-change.test.ts`, `employment-change-conversation.test.ts`). |
| `src/lib/forms/exit-draft.ts:39` (drafting rule example) | "worked as a tanning consultant at the Manhattan location" | "worked as a team member at the Manhattan store" | "Team Member" is a Buff title; "Store" is the user-facing term. Prompt example only; no test pins it. |
| `src/lib/forms/payroll-deduct.ts:8` (comment) | Named a person | "Requested by Operations" | Named individual in a code comment; the date and the "worded as written" rule are kept. |
| `src/lib/forms/proposal.ts:48`, `src/lib/ai/mock-provider.ts:101` (comments) | "Tanning Consultant" as the example title | "Team Member" | Comments describing a past default; no code change. |
| `docs/chat-parity.md` | Said "CA" shorthand and team-subject were absent; "CA for Avery" was an ordinary answer | Corrected | Verified in code: `CA_SHORTHAND` in `src/lib/forms/template-intent.ts:~498`; `src/lib/forms/team-subject.ts` (coaching only, `allowsTeamSubject` used by `ai/form-proposal.ts` and the instances route); `describesIncident` was already marked ported (`forms/incident-reading.ts`). Tests exist: `corrective-action-conversation.test.ts:329`, `owner-retest-e2e.test.ts:412`. |

## B. Needs company approval (NOT changed)

| # | file:line | Current text | Why it is Sun Tan City | Evidence | Question for approval |
|---|---|---|---|---|---|
| B1 | `src/lib/forms/exit-library.ts:403` | "Upload Exit Form to employee's personal file and remove employee from MyGlow." | MyGlow is the Sun Tan City employee system. | `exit-library.ts:85-88` itself notes there is no MyGlow integration. | What system, if any, is the Buff City Soap equivalent? Or should the step read "personal file" only? **25 Oct 2026 (Pau, via QA): MyGlow confirmed; unchanged.** The name is read from `EXIT_EMPLOYEE_SYSTEM` in `src/config/company/forms/exit-systems.ts`. |
| B2 | `src/lib/forms/exit-library.ts:411` | "Place comment on employee's Sunlync account stating they are no longer employed, verify tanning has been removed." | Sunlync is the Sun Tan City system; "tanning" is a product. | `docs/store-terminology-and-form-content-review.md:54` flags it. | Is there a Buff equivalent to verify on exit (Woven? payroll?), or should the step be removed? What does Buff verify is removed (access, discounts)? **25 Oct 2026 (Pau, via QA): Sunlync confirmed; now "Place comment on employee's Sunlync account stating they are no longer employed."** Only the tanning clause removed (revision 4). |
| B3 | `src/lib/forms/exit-intake.ts:40,83`; `src/lib/forms/exit-draft.ts:32,45,60` | Prompts and a guard regex name MyGlow and Sunlync. | These keep the model from claiming those steps were done. | Depends on B1/B2. | Update together with B1/B2 once the Buff steps are decided. The guard must keep covering whatever the Buff steps are named. **25 Oct 2026 (QA): prompts keep MyGlow and Sunlync (both confirmed); the guard keeps them and adds system-removal and account-comment claims in any words** (`exit-sibling-wording.test.ts`). |
| B4 | `src/config/company/job-titles.ts:22-28` and `src/lib/forms/employment-change.ts:114,126-150`, `salon-text.ts:33`, `epp-intake.ts:443-444`, `corrective-action-intake.ts:150,336-337`, `employee-reference.ts:104-105`, `official-policy-manual.ts:772-780`, `proposal.ts:1133` | SDIT, TSD, DMIT, FTTC, ASD, SD, TC, "Tanning Consultant", "Store Director" shorthand and patterns | Sun Tan City titles; none exist in Buff Woven. | `job-titles.ts` header and `store-terminology…:58` already flag them. | Removing them changes how typed titles are read (and EPP routing). Which shorthand do Buff managers use for General Manager, Assistant General Manager and Team Member? `corrective-action-intake.ts:150` prompt text ("e.g. TC, ASD, SD") should then change too. **21 Oct 2026: "TC" / "Tanning Consultant" removed** from `job-titles.ts`, the intake and role patterns, name stop-lists and the transfer example; the prompt now reads "e.g. Team Member, Assistant General Manager". FTTC and the other titles here are unchanged (the FTTC EPP template, B5, still uses FTTC). |
| B5 | `src/lib/forms/template-intent.ts:221-330, 708-790, 1453-1546`; `src/config/company/forms/categories.ts:48,61` ("DMIT EPP") | Matchers and role words for sdit-epp, tsd-epp, asd-sdit-epp, dmit-epp, fttc-epp, tanning-consultant-interview | Sun Tan City form family and roles. | Library keys are published templates. | Does Buff City Soap want any of these templates published? If not, which are retired? Role words follow that decision. |
| B6 | `src/lib/forms/library.ts:936,952,1237`; `epp-intake.ts:113,189,240,258`; `plan-summary.ts:191` | PPTA, UPTA, LPSVA, "Club Close", "Average Club Dollar" | Sun Tan City KPIs (tanning/membership). | `store-terminology…:57`. | Which KPIs does Buff track on a performance plan? |
| B7 | `src/lib/forms/hiring-library.ts:213` | "tanning bed they reserved is unavailable … demanding a refund" | Sun Tan City service scenario. | `store-terminology…:52`. Not resolved by 2A/2B. | Replacement scenario from Buff HR. |
| B8 | `src/lib/forms/hiring-library.ts:421,433-661`; `template-intent.ts:327` | "Tanning Consultant Interview Form", "Assistant Store Director or Tanning Consultant" | Role and form name. | `store-terminology…:51,53`. | Rename, retire or replace the form and question with Buff's equivalent? **25 Oct 2026 (QA): the Tanning Consultant Interview and both management interviews are hidden in code** (`config/company/forms/hidden.ts`): left out of the template list, the chat and the create route. Rows not changed; retiring or deleting them is still open. (Also covers B7.) |
| B9 | `src/lib/forms/hiring-library.ts:498` | "Sun Tan City Core Values" heading | Brand name on a Buff form. | `store-terminology…:51`. | Buff's core values heading and list. **25 Oct 2026 (QA): the heading reads "Core Values", the JBA Policy Manual's own heading for the same five values (p.7); the values are unchanged (revision 4, `seed-sibling-brand.test.ts`).** |
| B10 | `src/lib/forms/library.ts` (EPP builders, e.g. lines 40, 714) | "Assistant Store Director", "Salon Director" role wording in EPP comments and `{{roleAbbr}}` (ASD, SD, TC) | Roles not in Woven. | Woven positions above. | Buff role names to print, if these templates stay (see B5). |
| B11 | `src/lib/forms/official-policy-manual.ts:332,504` | "Dress for Success - Tanning Consultant" section name | It quotes the JBA manual's own heading for a Sun Tan City role. | JBA manual structure; `src/config/company/knowledge.ts:441-474` already filters brand sections. | Leave while the manual is the source; confirm. |
| B12 | `src/lib/ai/employee-performance-gate.ts:332,478,540-576` | "tanning consultant" as an employee word; "STC", "PPTA" in a stop list | Vocabulary list for a gate; changing it changes what is treated as a person question. | n/a | Needs a Buff vocabulary list and a behavior test pass. |
| B13 | `src/lib/forms/template-intent.ts:439`; `employment-change.ts:896`; `chat-correction.ts:152` | `stc`, `sun tan city` accepted as a place word ("to stc 12") | Sun Tan City location prefix. | Behavior is tolerant, not user-facing. | Drop it, or keep as harmless tolerance? |
| B14 | `src/lib/forms/team-subject.ts` (header), `src/lib/forms/policy-fields.ts:123` | Comment examples mention "bed sanitizing", "UV Tanning Bed Troubleshooting" | Sun Tan City examples in comments. | n/a | Comment-only; fine to reword to Buff examples once Buff supplies some. |
| B15 | `docs/store-terminology-and-form-content-review.md:55` | Lists a demotion "PT Tanning Consultant" example | The form template text in `employment-change-library.ts` has no tanning wording (checked); the example was the chat intake example, changed in A. | grep of the library file. | None for the template; that older doc line is now stale. |

Already resolved by Phase 2A/2B (PRs #48, #49): the prescreen uniform / UV-Sunless-Spa
question (`approved-removals.ts:33-34`) and the demotion placeholder. The stale line
`store-terminology…:50` still lists the prescreen item as retained and `:55` the demotion
item; this review does not edit that older document.

## C. Intentional fixtures and tests (left alone)

- `src/lib/knowledge-sync/woven/reference/` and `src/lib/knowledge-sync/woven/bcs/test-support.ts`, `*isolation*`, `tenant-isolation.test.ts`: Sun Tan City content to prove it is rejected.
- `src/test/fixtures/ask-sunny-*.json`, `approved-template-changes.json`, `src/test/approved-removals.ts`, `src/test/parity/*`, `src/test/qa/forms-migration-qa.test.ts`: the Ask Sunny snapshot used for parity.
- `src/lib/knowledge/brand-sections.ts`, its test, and `src/config/company/knowledge.ts:441-474`: the filter that removes other brands' sections from the JBA manual.
- `src/config/company/google-reviews.ts:114` (`OTHER_BRAND_TITLE_MARKERS`), `src/lib/google-reviews/test-support.ts:212`: isolation guards.
- `src/components/shell/app-switcher.tsx`: the intended two-way link between Ask Sunny and Ask Bubbles.
- `src/lib/reporting/scope/area-ids.ts:23`: a comment showing the slug format with a sample name; not a policy reference.
- `src/lib/forms/exit-draft.ts:112-120` and `exit-draft.test.ts`, `exit-draft-route.test.ts`, `exit-form-conversation.test.ts`: the HR feedback sample ("Harper Samples … tanning consultant", "Kayla Rowan") pins the header-restatement backstop. Rewording the sample would misquote the feedback; the logic is title-agnostic.
- The `stc-exit` to `resignation-exit` key logic: untouched.
- All other `*.test.ts` using SDIT/TSD/tanning text for B4/B5 behavior.

## D. Store / Location / Salon / Makery inconsistencies (for review, not fixed)

- Form field labels print "Location" (`library.ts:68,166`, `exit-library.ts:286`, `employment-change-library.ts:118`) and "New Location, if applicable" (`:154,211`), while the product term is "Store" (`brand.ts:22`).
- Admin and analytics screens say "Location", "Locations", "By Location" (`validation-panel.tsx:269,302`, `analytics-screen.tsx:36`, `usage-types.tsx:59`, `analytics/tables.tsx:92,211`) and `inline-form.tsx:496` ("Location"). Reviews use "store" (`reviews-data.tsx:1271`).
- `src/types/index.ts:897` comment says copy uses "location", "Buff may prefer Makery".
- "Makery" appears in `hiring-library.ts:203` ("cleaning the Makery") and in resolver/title patterns, but nowhere else in user-facing copy.
- "Salon" still appears in user-visible form text through B10 and in field keys (`salon_productivity`, `salon_ppta`; keys are intentionally kept). Internal comments and variable names (`salonById`, `SALON_PHRASE`, `google-reviews/goals.ts` docs, `forms/instances/route.ts` comments) say "salon"; these are not user-facing.
- `resolver.ts:134` accepts salon|store|location|studio|shop|makery as place nouns, which is tolerant input handling, not copy.

Question: which single word should each surface use (form field labels, admin screens), and does Buff want "Makery" anywhere in copy?
