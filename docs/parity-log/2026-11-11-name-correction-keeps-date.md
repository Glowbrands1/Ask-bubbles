## 11 Nov 2026: NAME_CORRECTION_KEEPS_DATE_ENABLED stays Ask Bubbles only

s14 path 1 (QA, from Gate-Bubbles' probe): after "Is this for **Rozlyn Quellmar**?" → "Oops, it's Rozlyn quellmar", the card
lost the date given earlier ("October 1st"), and every later card for her lost it too, on production's flags. Here the
answer is read as the request again and the card's date is not carried in the conversation's history.
NAME_CORRECTION_KEEPS_DATE_ENABLED re-reads the date the manager gave before the name question
(`ai/name-correction-keeps-date.ts`).

Not needed in Ask Sunny: checked on its r22 head (ee7e373f) through the real chat route with the same six turns and
production's flags — the card keeps 2026-10-01 on turns 2–6, because Ask Sunny's stored form state carries the date
across the name correction (the same reason its s14 path-2 case is a guard there).
