# District Manager feedback of 21 Oct 2026: status and remaining fixes

Five reports, all left on 21 Oct 2026 against the Corrective Action Form and
all still `pending` in the admin feedback queue. Each one was traced to its
stored conversation, proposal card and saved form using read-only `SELECT`s
against the Ask Bubbles project. Nothing in the database was changed, and no
feedback row was resolved or dismissed.

**Redaction.** Employees are called Employee A and Employee B below.

## Where each report stands

Most of these were already fixed by the Corrective Action work merged earlier
the same day (PRs #59 to #64), and `corrective-action-dm-feedback-e2e.test.ts`
covers that work. Three defects were still live. This branch fixes them.

| Report (verbatim) | Cause | Status |
|---|---|---|
| "bubbles did not fill out any section of the CA" | The reply "written" became the form's only source turn, so the draft had nothing to write from. | Fixed earlier (c51d8b9). A regression test for this exact shape was added here. |
| "bubbles cited S.O.Conduct vs the cell phone/smart watch policy page 19. had to tell bubbles twice it was a verbal CA" | (1) "verbal CA" was not read as the warning level. (2) The account of phone use never reached the manual's **Cell Phone/Smart Watch Policy**. (3) The new CA, for Employee B, inherited Employee A's "no payroll deduct" from earlier in the chat. | (1) fixed earlier (99ebb37). **(2) and (3) are fixed here.** |
| "bubbles did not state in the action plan that [employee] would be payroll deducted $3.25" | "payroll deduct of $3.25 is applicable" was not read, and the plan did not state the deduction. | Fixed earlier (ab499bd, f266cb0). |
| "bubbles repeated the date of the offense" | The observation was dated with the form's date (today) instead of the incident date, and stated it twice. The prior coaching's date was also offered as the form's date. | Fixed earlier (e5b882a, b1c655b). |
| "type of offense - under other … woven deadline of 9-30-26 … action plan … should only have 2 sentences" | "Other" was filled by the **browser's form history** from an earlier form (the save is marked `manager`, and the draft never wrote that field). The Action Plan was free text from the model. | Fixed earlier (062e5dc turns autofill off; be01df5; f266cb0 builds the plan as two sentences). |

## Fixed on this branch

### 1. A policy heading with a slash never matched

The JBA manual's heading is "Cell Phone/Smart Watch Policy" (page 19). A named
policy has to match a heading word for word in both directions, so "cell phone
policy" failed, because "smart" and "watch" were never said. The tests used a
made-up heading, "Cell Phone Usage", so nothing caught this. A heading with a
slash now names one section in two ways. Every word the manager says must
still be in the heading, and either side of the slash must be said in full.
The rule still fails closed: "phone" alone, or "attendance" against
"Seminar/Webinar Attendance", matches nothing.
*(`src/lib/forms/named-policy-section.ts`)*

### 2. A policy the account describes but does not name

"on 10-20-26 [Employee B] was talking on her cell phone for over 30 minutes"
names no policy, so the model ticked Standards of Conduct. An account that
describes the employee's own phone or smart watch in use ("on her phone",
"cell phone use", "texting") is now treated as naming that policy. It then
goes through the same manual-heading match, so the manual still decides the
section, its page and its wording. The reply says what the account reads as,
without claiming the manager said it:

> **Policy:** this reads as the policy manual's **Cell Phone/Smart Watch
> Policy** (page 19). I'll quote it on the draft under **Violation of Company
> Policies**. Tell me if a different policy applies.

A policy the manager states, or one they name by the manual's heading, still
wins. "I called her phone", "the store phone" and "on the phone with a guest"
do not count as phone use.
*(`named-policy-section.ts`, `ca-policy.ts`, `src/lib/ai/form-proposal.ts`)*

### 3. One employee's answers carried onto another employee's form

A CA for Employee A, then "no payroll deduct", then "create a verbal
corrective action form for [Employee B] …": the unnamed short reply was kept
as one of B's turns, so B's card read back "Is payroll deduct applicable?
**No**". Now the first request for an employee that follows turns about
someone else starts that form's turns. A correction of the person ("actually
it's for …") is not a new request, so it still keeps the account.
*(`turnsAboutThisForm`, `src/lib/ai/form-proposal.ts`)*

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `eslint` on changed files | clean |
| `npx vitest run` (whole suite) | 399 files passed, 6 skipped. 9,666 tests passed, 59 skipped, 0 failed. |
| New tests | `corrective-action-dm-feedback-e2e.test.ts`: the production turns replayed through the real proposal flow and the create, draft and review routes. `named-policy-section.test.ts`: slash headings, described policies and fail-closed cases. Before the fix, 3 of the new end-to-end cases failed against the original code. |

## For the reporter

After deployment, the reporter should retest two things: a CA for phone use
described in her own words, and two CAs for different employees in one chat.
Only her confirmation should move these feedback records forward.
