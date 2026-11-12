## 11 Nov 2026: a name after "by" at the end of a passive sentence is the doer — Ask Bubbles only (NAME_LAST_AFTER_BY_ENABLED, default off)

QA's B-C1, from the open-cases audit: QA's name matrix of 4 Nov 2026, "corrective action: a guest was treated rudely at the front desk on monday by corin bellweather" (and the same with a date), in lower case or capitals, made no card for the roster's Corin Bellweather.

- In lower case, `rosterNameNamedIn` skips a name after "by" as a reporter.
- In capitals, the name reader took "BY CORIN BELLWEATHER" as the name.

With the flag on:
- A full roster name after "by" at the end of a passive sentence is the doer, unless the "by" follows a reporting word ("reported / signed / seen by").
- A card name "BY <roster name>" is that roster person (`lib/forms/name-after-by.ts`).
- No protected file is touched.

Not needed in Ask Sunny. The same four wordings run there as a replay probe on production flags (Corin Bellweather on the roster). Lower case and capitals without a date, and lower case with a date, already make the card for Corin Bellweather. The dated capitals wording is the "BY <NAME>" shape that ask-sunny#802 (CAPS_PREPOSITION_NOT_NAME) fixes.
