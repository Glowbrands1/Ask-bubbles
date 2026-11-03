# 2026-11-03 — ADDRESS_NOT_PERSON: a date is not a house number (Sunny only)

Ask Sunny's `withAddressNotPerson` (ADDRESS_NOT_PERSON_ENABLED) read the year
of a date as a house number: "On 10-20-26 Jane Doe was late to open" made
"Jane Doe" a street address (QA, 3 Nov 2026). Sunny now skips any number the
date reader (`datesInText`) reads as part of a date.

Not needed in Ask Bubbles: Bubbles has no ADDRESS_NOT_PERSON guard and no
`withAddressNotPerson`, so a number before a name never clears its card here.
If the address guard is ported, port it with the date check.
