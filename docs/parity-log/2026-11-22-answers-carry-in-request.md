# A stated level and payroll answer stay on the card for the rest of the request (QA's Bubbles round 2, U35)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts` (`requestRecord`). QA's ruling of 22 Nov 2026 amends the
16 Nov rule for replies that show no card. With no card on screen and no form open, the request's latest record of
this card (same form, same person, same request) still carries its warning level and its payroll answer. They stop
carrying at a new request (`new_form_evidence`), at another person, or at another form.

Report: T2 "i have an employee, <P13> that needs a corrective action form with a customer complaint", then T3 "verbal
warning, no payroll deduct, part-time team member,". Later turns were answered with no card (T10 "can i review the
card"). T11 "Create a Corrective Action Form from this conversation." got "Payroll deduct and warning level aren't
set", and the draft saved no payroll tick. Replay case: `nov22-r2-u35-*`. The full pack is green: 2328 passed, 43
expected fail.

**Ask Sunny: same gap, port pending.** Sunny's `carriedRecord` and `openCard` (`agent-loop/tools.ts`, `origin/main`
9ab3c93) are the same code: a card on screen is required. This session has read access only to Ask Sunny, so the
port goes to the Sunny coder through QA, titled `Port from Ask Bubbles (<sha>): …`.

**QA's amendment (22 Nov 2026, from Sunny's port).** With no card on screen, the level and payroll answer carry only
while the card is the same incident as the carried record. The comparison is on the records' data: this turn's
account is that record's account (its one-way key), or the turn names the record's incident date. A turn that gives no
account ("verbal") is the same card. A new incident ("another ca for <P>, late on 11/14 too") starts clean, even
without `new_form_evidence`. Control case: `nov22-r2-u35-new-incident-starts-clean`.
