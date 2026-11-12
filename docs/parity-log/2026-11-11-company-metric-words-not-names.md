# 2026-11-11 — COMPANY_METRIC_WORDS_NOT_NAMES (Bubbles-only)

**What:** a sales Corrective Action written in Buff City Soap's own KPI words lost its Issue.
For example: "She was below goal in IPT, AOV and Comp Sales % for October", or "She had 40 transactions and was
below in IPT, AOV, and Discount Rate".

The name reader took "Comp Sales" and "Discount Rate" for a person, and the person guard let them through. The guard's
business vocabulary held only the sibling app's metric words. The next turn's card was then drawn from that turn alone.

With `COMPANY_METRIC_WORDS_NOT_NAMES_ENABLED` on, a candidate made only of the company's metric words is not a person.
The metric words live in `src/config/company/metric-words.ts`, taken from the Domo KPI deck: IPT, AOV, Comp Sales, SSSG,
Net Sales, Discount Rate, Product Mix, Laundry %, AUV, items per transaction and average order value. Measure words
and percent signs may sit beside them. Somebody on the roster is still always a person ("Delphine Sales").

**Why not ported to Ask Sunny:** checked on Ask Sunny main 2805f4f1 with production flags. Sunny's own metric words are
already in the shared business vocabulary (PPTA, LPSVA, UPTA, Spa, Club). In a chat, Sunny keeps the account as the
Observation of Offense for its own phrasings:
- "She had 40 tans and was below in UPTA, LPSVA, and Club Close %"
- "She was below in Unique PPTA, Average Club Dollar and Spa %"
- the round-5 PPTA list

The name reader still offers "Club Close" and "Average Club Dollar" there, but the card keeps its account. Sunny also
has no `src/config/company/` folder to hold a list. If Sunny ever needs one, port the mechanism: a company list read by
`person-guard.ts`, never these words.
