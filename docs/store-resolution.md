# Store resolution and Woven employee verification

One resolver reads "which store" for Ask Bubbles chat, form proposals and form autofill: `src/lib/stores/resolver.ts`.
`location-mention.ts` (chat/proposals) and `salon-text.ts` (autofill) are thin wrappers over it.

## Sources (nothing is invented)

| Phrase | Comes from |
|---|---|
| Store number | the registered code (`src/config/company/locations.ts`) |
| Full name, city, city + state, state + city, street-qualified name, partial name | derived from the registered name/state |
| Woven name ("NE Grand Island", "SD Dawley Farms") and Woven number | `woven_location_map` rows a person has `mapped` to a registered store, pinned company, not closed (`woven-aliases.ts`, cached 5 min) |
| Nickname / abbreviation | `COMPANY_LOCATION_NICKNAMES` / `COMPANY_LOCATION_ABBREVIATIONS` (reviewed, currently empty) |
| City initials ("GI", "SF") | derived; always confirmed, never used silently |
| Typos | edit distance against the phrases above; always confirmed |

## Outcomes

`resolved` (one store) · `ambiguous` (every candidate offered, only from the actor's own scope) · `not_found` (said so; nothing invented).
A number two systems give to different stores (registered 225 = Sioux Falls, Woven 225 = Omaha) is ambiguous, never resolved by digits.

## Employee verification (read-only)

For coaching, corrective action, performance-plan and policy-review forms the typed name is matched against the scoped Woven directory
(`employee_access_directory`). A verified employee gets Woven's `position_name` as the form's job title (over the manager's wording), their
mapped stores are compared with the store named, and the result is on the card (`employeeVerification`). Unverified outcomes carry a reason:
`not_found`, `unavailable`, `not_checked`, `ambiguous`, `no_title`, `stale` (not synced for 72h), `not_active`. Nothing is written to Woven or the directory.
Same-name employees are narrowed by the store the manager names, otherwise the manager is asked which store.

Exit and employment-change forms keep their own name handling: Woven is consulted only to verify an exact match.

## Numbering

Buff City Soap store numbers are primary. Woven numbers are secondary aliases, honoured only for Woven locations a person mapped. A number that
means different stores in the two systems (registered 225 = Sioux Falls, Woven 225 = Omaha) is never resolved silently: the reply names both systems and asks.

## General chat

`src/lib/ai/entity-facts.ts` runs on every non-form question that names a store or a person in the asker's scope. A pure lookup ("What is Sarah Miller's
job title?", "Which store is Dawley Farms?") is answered outright from Woven / the registered stores with no model call; other questions get a VERIFIED RECORDS
block and a prompt rule that titles, store assignments and status come only from it. Out-of-scope employees are indistinguishable from unknown ones.

## Follow-ups

On an open form: "Actually, use the Omaha store" replaces the store (and the employee is re-verified against it); a bare "Omaha" or "yes" answers a store
question; a store mentioned in passing is not a change (two stores is a question). A transfer is filed at the store being left.

## Titles, pronouns and policy

- A job title Woven holds (read from `woven_position_map`) is never read as a second person: it is lower-cased in the working copy the name reader sees (`known-titles.ts`).
- General chat ties "What about her title?" to the one person the most recent naming turn establishes, within the asker's scope; zero or several is a question ("Who do you mean?"), never a guess.
- POLICY: the synchronized Woven directory is the source of truth for title, store assignment and status. A verified Woven title wins over the manager's wording and the difference is said; the manager's own title is used only where Woven could not verify, and is labelled theirs. A named store Woven does not show the employee at stands, with the disagreement said.
- The prompt always forbids stating an employee's title/store/status without a VERIFIED RECORDS section, and says to report (not adopt) a difference.

## Scope

District/region accounts are verified across the stores their area contains (resolved through the registered roster, plus any additional stores granted).
An area that resolves to no store stays unchecked — never open to everyone.

## Known limits

- The registered roster has seven stores. Woven locations that are unmapped or ignored (e.g. ND Fargo, MO Raymore) are not recognised until a person maps them.
- Titles come from the daily Woven sync, not a live call.
- District/region scopes resolve to no stores (no area roster), so employee verification reports "not available" for them.
- General Q&A chat that merely mentions an employee does not verify them; the form paths do.
- Woven titles are printed as Woven spells them (e.g. "Team Member Part Time"). A manager typing a Title Case title the company job-title list does not know can still be misread as a second person.
- Matching by Woven employee ID, and pronoun follow-ups in general chat ("what about her title?"), are not supported.
