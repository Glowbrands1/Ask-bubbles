# Not needed here: an exit card's Date line agrees with the card (the sibling app's EXIT_DATE_LINE_AGREES_ENABLED)

QA's round-6 parity audit (8 Nov 2026). In the sibling app, "exit form for <name>, last day 11/05, gave no notice"
listed "- **Date:** the day the draft is created" while the card under it said "**Date:** 11/5/2026", and the form
was created dated 11/5. Its fix, live there since round 5, makes the list's Date line the card's.

Not needed in this app: checked on main 5f51187e with production's flags, the same request (store wording, an
invented person) gives a card with no date and a list that says "- **Date:** the day the draft is created", which
agree; 11/5 is listed as **Last Day Worked**. An exit request with no date agrees the same way.
