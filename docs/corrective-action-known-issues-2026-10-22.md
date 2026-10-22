# Corrective Action — remaining issues after round-3 QA, 22 Oct 2026

Branch `claude/lucid-goodall-06noak`. These are known and NOT fixed on this
branch. Each says what was observed, why it matters, and what would close it.

## Validation that was not done

### No test against the real model on a staging environment
Everything was tested with the rule-based readers, an in-memory fake database,
and — in the browser — a production build against a throwaway local
Supabase-shaped stack with a local stand-in for the Anthropic API that returns
scripted drafts. The real model's wording of drafts, and its behaviour on
unusual accounts, has **not** been exercised by this round.

Why: this project's Vercel preview deployments use the production database, so
a preview is not a safe staging environment for creating disciplinary records,
and no model API key was available to the QA environment.

To close: a staging Supabase project (or a preview environment pointed at one),
seeded with synthetic people and the manual, plus a model key scoped to it. Then
run the browser spec (`e2e-local/ca-flow.spec.ts` in the QA harness) against it.

### Natural language is still rule-based
Request, level, payroll, date, prior-action and policy readers are regular
expressions. Round 3 tested 26 phrasings (16 written without looking at the
readers) through to the saved form, plus negatives, and all pass — but new
wording will still find gaps. Treat each one reported from the field as a test
case first.

## Policy manual approval

Ask Bubbles cites "the official policy manual" chosen by its title in the knowledge
base. Nothing records that the uploaded document is the company's **approved**
manual: there is no approval flag, approver or date on the document, and the
`knowledge_sync_audience_decisions` rows approve audiences, not a policy source.
See `docs/policy-source-validation-2026-10-22.md`.

What the code does today: a missing or ambiguous manual is never guessed at — the
draft is kept, the policy lines are left for the manager, and finalizing an
unverified quote needs an explicit acknowledgement. What it cannot do is tell an
approved manual from any document with the right title.

To close: an explicit, auditable designation of the approved manual per tenant
(who approved it, when, which version), checked before a quote is marked
verified. This is a product and HR decision, not only a code change.

## Bubbles: a benign import cycle

`src/lib/forms/template-intent.ts` → `warning-level.ts` → `payroll-deduct.ts` →
`template-intent.ts`. Introduced on this branch (origin/main has no cycle).

It is safe today because every use of an imported binding in these three files is
inside a function body; nothing is read while the modules load. A production
build (`next build` + `next start`) was run and the chat and forms routes
answered normally in the browser.

Why it still matters: the same shape in Ask Sunny DID break a production build —
there, a module read an imported constant at load time, and `/api/chat` and the
forms routes answered 500 ("Cannot access … before initialization") while every
unit test passed, because the test runner loads modules in a different order.
One top-level use of an imported value in any of these three files would do the
same here.

To close: move `statedWarningLevel` (and what it needs) out of the cycle, or have
`template-intent.ts` stop importing it, as Ask Sunny now does
(`src/lib/forms/warning-level.ts` there imports nothing).

## Bubbles: wrong reason when the framework document is missing

With the Performance Management Framework document absent, the Corrective Action
card said "You didn't tell Bubbles what happened…" instead of the server's real
notice that the framework is unavailable. Seen in the local browser run before the
framework was seeded. Misleading, not data-affecting.

## Behaviour unchanged from origin/main (noted, not changed)

- A remark about history alone ("tess varga had a written warning last month for
  tardiness") still proposes a Corrective Action card. Nothing is filed without
  Create.
- A message of eight words or fewer that names a policy is read as the answer to
  "which policy?".
- Plain lateness and a register shortage are asked about rather than mapped to a
  policy automatically (by design).
