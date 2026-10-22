# Ask Bubbles — post-deployment smoke tests (full release, pull request #69)

**Setup**
- Run these on production right after the deploy.
- Use **synthetic test accounts only**: a store manager assigned to two stores, a District Manager and an admin.
- Use a synthetic employee who does **not** exist in the directory (e.g. "pat rivera").

**Data handling**
- Create **drafts only**. Never finalize a form.
- Delete each test draft afterwards, or leave it for HR to discard.
- Do not open, edit or correct any real employee's form, and do not touch the historical forms under HR audit.

**Rollback:** if any check marked ✱ fails, redeploy the previous production deployment from Vercel (`askbubbles`, deployment `dpl_qapWgWpjkZjZ3SQk7okAmXUvBm2V` of `main` `e7dd377`, the payroll-only release). No migration is involved, so rollback is a redeploy only. Rolling back keeps the payroll safeguards, which are in `e7dd377`.

| # | As | Type / do | Expected |
|---|---|---|---|
| 1 ✱ | store manager | "create coaching form for pat rivera, late 3 times this week", then "i already told you", then "today" | One Coaching card for **pat rivera** (spelling as typed) stays open across all three turns; no form picker |
| 2 ✱ | store manager | Reload the page | The same conversation and the open card come back |
| 3 ✱ | store manager | A form for pat rivera, then reply with the name of the account's **other** store | That store is set; employee unchanged |
| 4 ✱ | store manager | A form for pat rivera, then reply with a store the account is **not** assigned to | Store left blank and asked; employee unchanged |
| 5 ✱ | store manager | Card location choice | Only the account's own stores are offered |
| 6 ✱ | admin | "create a coaching form for Sarah Miller at store 225" | Not guessed: the card asks between the two stores the number names in Buff City Soap's and Woven's numbering |
| 7 ✱ | store manager | "create a verbal ca for pat rivera, late today. we will not payroll deduct $25" | Card: payroll **No** |
| 8 ✱ | store manager | "… payroll deduct $25" → Create draft → "we cancelled the $25 payroll deduction" | The draft's payroll answer becomes **No**; the Action Plan has no deduction sentence |
| 9 ✱ | store manager | "… maybe payroll deduct $25" | Payroll **not** answered; the card asks Yes or No |
| 10 ✱ | District Manager | Ask for a coaching form | No store filled in, and the form cannot be created (fail-closed, unchanged) |
| 11 | store manager | "write a coaching form for pat rivera, dated 10/20" | Employee **pat rivera**; form date 10/20 |

Record for each check: the time, the account (role only), pass or fail, and a screenshot of the card. The browser versions of checks 1–9 ran 12/12 on a disposable local stack before release (`evidence/`).
