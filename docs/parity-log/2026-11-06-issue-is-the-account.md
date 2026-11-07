# Bubbles-only note: the card's Issue is the account, never the level or the name (ISSUE_IS_THE_ACCOUNT_ENABLED)

QA's flip-3 tester (6 Nov 2026, D): "…<name variant>, verbal, she was late on 10-20-26" gave What happened = "verbal", and with a nickname, the typed name. This app's card reads an Issue from the request's for-clause (`forms/incident-issue.ts`), and that took the first clause after the person. Under ISSUE_IS_THE_ACCOUNT_ENABLED (default off), a bare level clause and a short clause naming the person are passed over.

Not ported: the sibling app has no Issue reader and no Issue line on its card. QA's shapes, probed there through the chat route, keep the lateness: its Observation of Offense reads "verbal, she was late on 10-20-26". The leftover "verbal," prefix there is a different reader, reported to QA as its own item.
