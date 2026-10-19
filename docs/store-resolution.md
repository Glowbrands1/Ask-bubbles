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

## Known limits

- The registered roster has seven stores. Woven locations that are unmapped or ignored (e.g. ND Fargo, MO Raymore) are not recognised until a person maps them.
- Titles come from the daily Woven sync, not a live call.
- District/region scopes resolve to no stores (no area roster), so employee verification reports "not available" for them.
- General Q&A chat that merely mentions an employee does not verify them; the form paths do.
