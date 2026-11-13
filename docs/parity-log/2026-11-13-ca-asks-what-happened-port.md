## 13 Nov 2026: CA_ASKS_WHAT_HAPPENED + WHAT_HAPPENED_NO_CREATE ported from Ask Sunny

Pau's direction via QA (13 Nov 2026): port Ask Sunny's "what happened" check — its #331 (CA_ASKS_WHAT_HAPPENED_ENABLED)
and its round 23 (WHAT_HAPPENED_NO_CREATE_ENABLED), both on in its production — to this app, behind the same flag
names, default off. The mechanism is ported; the wording is this app's own (`NO_INCIDENT_NOTE`, its store and job
titles).

What this app did before (main e5fd5b1c, production flags, the replay pack's invented Rowan Kestrel):

- "create corrective action form for Rowan Kestrel, Team Member Part Time" (and "…, Assistant General Manager"): the
  card's Issue was the job title and nothing was asked — Sunny's #331 shape. The protected proposal reader takes the
  title as the account; this roster's positions are not all in `config/company/job-titles.ts`.
- A name alone, "not late", "didn't do anything wrong", "Create a corrective action." → the name: already asked "You
  haven't told me what happened yet" (the protected reader's own note), but beside an active **Create draft** and
  "Create the draft here when you're ready".

Ported:

- `ai/ca-what-happened.ts` (CA_ASKS_WHAT_HAPPENED_ENABLED, after the reply is built, in `server-ask.ts`): a Corrective
  Action card for a named person with no account in the manager's turns for it carries the intake's note once per card.
  The account test is the Coaching card's (`ai/coaching-what-happened.ts`, its helpers now exported) with Sunny's
  production refinements: a denied fault ("not late", "never late", "didn't do anything wrong", also after "ca for
  <name>") is no account; a duty not done ("not signing off on the cleaning check list", "Not meeting sales
  requirements") is one. Different from Sunny on purpose: (a) this app's card has an Issue line, so an Issue that is
  only who and where (a job title, the store, the name) goes from the card and its line — else REPLY_MATCHES_CARD reads
  it as an account and takes the ask back; (b) job titles are read without the company list's gaps (General Manager,
  Assistant General Manager, part/full time); (c) "she was never late" is a denial here (Sunny reads "never <verb>" as a
  duty not done), and a clause splits at "but", so "not late but left the register open" is an account.
- `forms/what-happened-no-create.ts` (WHAT_HAPPENED_NO_CREATE_ENABLED, in the chat route): Sunny's, unchanged.

Not ported: Sunny's NO_ACCOUNT_NO_APP_POLICY (the card citing no policy while it asks) — not asked for. Left as found:
after the manager answers the ask, the protected reader still rebuilds the card's Issue from the request (the job title
again); the card offers Create as it should.

Sibling app: nothing to port back — this is Sunny's mechanism. (c) above may be worth taking to Sunny; reported to QA.
