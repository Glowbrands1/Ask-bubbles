# 2026-11-11 — Bubbles replay cases use neutral retail metrics (Bubbles-only, test-only)

**What:** 12 Ask Bubbles replay-pack case files spelled their sales accounts with the
sibling app's metric names (PPTA, LPSVA, Club Average, Club Close %, CC%, Avg Club,
Spa %, "tans"). They now use neutral retail words (UPT, ATV, Average Ticket, Bundle
Rate %, BR%, Avg Ticket, Gift %, "transactions"). No product code changed.

**Why Bubbles-only:** this is Bubbles test data. Ask Sunny's cases use Sun Tan City's own
metrics, which are right there.

**Left as is, on purpose:**
- `nov6-sales-shortfall-object-cases.ts` ("131 tans"): tests the word itself; Coding-6's
  #705 addresses it (QA, 11 Nov 2026).
- `nov8-policy-correction-not-account-cases.ts`: Bubbles' sales-CA detection
  (`ca-policy.ts`) recognises "ppta", not the neutral words, so the account is lost
  from the Issue after a swap. This changes the case's result, so it stays as written.
  The detection gap itself is under investigation for QA (no build yet).
- `NOT_A_NAME` in `employee-performance-gate.ts`: rejects those words as names only (QA).

**Check:** the replay pack's status for each case id compared before and after, in 8 modes
(production flags, all 18 fix flags, and six single flags): 0 ids differ.
