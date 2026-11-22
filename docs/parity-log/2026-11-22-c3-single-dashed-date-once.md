# One dashed date with no year is stated once in the saved Observation (QA's live re-run, C3)

**Fix (Ask Bubbles):** `src/lib/forms/account-facts-kept.ts` (`withWrittenDates`). "create a CA form for <Last>,
<First> at dodge. she was late on 10-16" saved "<first> was late to work on October 16, 2026. <first> was late on
10-16.". The keep-the-facts pass reads a dashed date only with its year ("10-20-26"), because a bare "10-12" is more often
a range, so the card's "late on 10-16" looked missing and was added again. A bare dashed month-day is now read as a date
only when the write-up itself states that month and day; a range, or a date the write-up does not hold, is read as typed.

**Ask Sunny: same gap, port pending.** Sunny's `account-facts-kept.ts` has the same `sameDates` (dashed dates with a year
only) and no `withWrittenDates`, so the same Observation would say it twice there. This session has read access only to
Ask Sunny; the port goes to the Sunny coder through QA, titled `Port from Ask Bubbles (<sha>): …`.
