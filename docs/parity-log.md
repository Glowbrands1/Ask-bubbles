# Parity log: Ask Sunny ↔ Ask Bubbles

This app is a port of Ask Sunny (`Glowbrands1/ask-sunny`); see
`docs/chat-parity.md`. Every fix to chat, forms, Corrective Action, policy
citation, access or sync is either ported to the sibling or listed here as
staying one-sided, with the reason.
See `CLAUDE.md`.

## 22 Oct 2026: HR's two Corrective Action reports of 21 Oct, checked in both apps

Both fixes were already on `main` and live in both apps; this adds HR's Ask
Sunny wording as a test here too.

| Report | Fix | Ask Bubbles | Ask Sunny |
|---|---|---|---|
| Bubbles: "Bubbles did not fill out the form" (written CA, missed monthly meeting, then "written") | A short answer keeps the request's account | c51d8b9 | its proposal reads every recent turn for a CA, so it never dropped the account; same test in `hr-feedback-oct21-e2e.test.ts` |
| Sunny: "Sunny would not create the form" (Verbal CA, missed Woven deadline; Save, then "Official policy verification is incomplete") | A Save re-writes only the values that changed | ported in ffab76e; the server half was already there | cf1480b; test 6a85d8e |

New test in both apps (`hr-feedback-oct21-e2e.test.ts`): HR's Sunny wording
played through the chat, Create, the card's Save and Finalize. It fails
without the Save fix in each app.

## 22 Oct 2026: both apps brought level (pending QA review)

Every chat/forms fix merged to either `main` from 12–21 Oct was compared. The
gaps below are closed on branch `claude/lucid-shannon-v79zju` in each repo,
**not yet merged to `main`** (QA hold, 22 Oct). Everything else already
existed in both.

### Ported into Ask Sunny from Ask Bubbles (sibling)

| Bubbles commit | Fix |
|---|---|
| c32eb59 (+ Sunny's own unmerged 0090bef) | The open conversation stays in the address; a reload reopens it |
| fe871f1 | Confirm before deleting a conversation or finalizing a form |
| ab77b14 (+ Reviews/Videos from Sunny's unmerged c2a0e88) | Small links and buttons at least 24px to tap |
| 062e5dc | Browser autofill off on every typed form field |
| 987e4b7 | "Create a form" shown only to an account that may create one |
| 4cbb84c | "write a CA for X" read as a request; the CA leads when asked for |
| 8cdc41b | What an earlier coaching was for stays on the history line |
| ac36870 | HR's 21 Oct wordings: payroll answers, a friend/coworker in the account is not the employee |
| b1047ab | One employee's short answers never land on another's form |
| 9530112 | "verbal, payroll deduct no." read as the level and the payroll answer |
| c25e05c | Possessives, all-caps/lower-case names (capitalised on the card), punctuated salons, Google store codes — cherry-picked from Sunny's own unmerged c52d74c, d616cf4, fa565c0 |
| 8e3e81e | Intake stays open on a salon / "I already told you"; "my employee <name>"; CA offered beside Coaching after a repeat |
| 51e1d5e | Exact title match when a knowledge upload supersedes a document; `/api/health` no longer 500s in demo mode |
| 54b3d42, 6e92b9d | Template sync lists every failure; an interrupted publish is finished, never reported as success |

Sunny gained an end-to-end regression suite for HR's 21 Oct conversations
(`src/app/api/forms/hr-feedback-oct21-e2e.test.ts`).

### Ported into Ask Bubbles (this app) from Ask Sunny

| Sunny commit | Fix |
|---|---|
| cf1480b | After a Save the card reloads its form; a refused finalize opens the policy dialog instead of a dead-end error |
| 4c15744, b78a497, 5ffa19e | Policy notices say "Woven does not see this policy in the knowledge base" |
| 1d63aeb | A Corrective Action lists the employee's forms already on file as prior actions |
| 7b3edea | Timeout headroom for two slow test suites |

### Staying one-sided (by design)

- Sunny only: EFTs (5b7686a), KS Manhattan district move, Google reviews
  posted-date anchors (76b2b85 — Bubbles already counts by Google's own create
  time).
- Bubbles only: Buff City Soap content, Store/Guest terminology, Forms Register
  name, sidebar order, Bubbles' account provisioning, `entity-facts.ts`
  (efde160), the store resolver and Woven title verification (ffea279), the
  report ask bar's form list (b87431c — Sunny lacks the feature).
- Bubbles only: `revocation.local-stack.test.ts` proves a session is alive
  through Ask Bubbles' API instead of a direct knowledge read, because
  Bubbles' knowledge tables are server-only (`20261003001000`). Sunny's
  knowledge policy differs and its revocation test already passes (QA, 22 Oct
  2026).
- Woven-affiliation designation (Bubbles 6d388ad) is not needed: both apps now
  show a manager the forms at every location Woven assigns them.

### Open decisions (not ported yet)

1. Sunny: admins who aren't company-wide limited to granting their own areas (Bubbles 2123821).
2. Sunny: asking "which date goes on the form?" when two incident dates are given (Bubbles 9c02dcb).
3. Sunny: every form, not only CAs, built only from the turns about that form and person (Bubbles a73ef6c).
4. Sunny: two forms from one message, and "which one?" for a correction (Bubbles 01fa914, 8b79a46).
5. Sunny: Bubbles' store resolver / Woven title verification / chat-side people lookup (ffea279, efde160).
6. A same-origin guard on Sunny's Apify review-sync admin routes.

## 22 Oct 2026: from Ask Sunny — CA recipient, and no real people in the repository

- **Ported** Sunny 6b5f897 (PR #127): "CA for <name>" is the recipient; the
  incident's other names are not candidates.
- **Ported** Sunny PR #130: tests, comments, docs and migration notes use
  synthetic people only (both companies' real names and work addresses
  removed); `src/lib/security/no-real-people.test.ts` guards company
  addresses. Bubbles has no copy of the policy-manual fixture, so that part
  of Sunny's change does not apply.

## 22 Oct 2026: Corrective Action QA audit (Ask-bubbles#68 → ask-sunny#128)

Every fix in this audit is ported to Ask Sunny in Glowbrands1/ask-sunny#128,
one `Port from Ask Bubbles (<sha>)` commit per fix: the invented-date guard
in drafted text, the draft notice on the chat card, payroll amounts without
`$` and "$0" as No, a cancelled order beside the deduction not read as a
waiver (7add5b2), the register `form_date` kept in step with the Date line,
the two-policy question ("Cell Phone/Smart Watch or Social Media?"),
autofill off on typed form fields, and the audit's manual fixture with
invented wording (400bab2). Ask Sunny keeps its own payroll rule (a Yes is
read only when stated) and sets the warning level on the form.
