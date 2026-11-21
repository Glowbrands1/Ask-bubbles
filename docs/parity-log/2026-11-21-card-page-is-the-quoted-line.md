# 2026-11-21 — the loop card's policy page is the page Create quotes (QA's live re-test, item 6 / A4)

**Ask Sunny has the same bug; port pending (not done in this session).** QA, on Pau's account with the agent loop on:
"the card's policy line says p.12 but the quoted policy text under it says p.13" (a register shortage). Create quotes a
Standards of Conduct incident the manual lists on its own line ("Register / Bank shortages", printed p.13) and cites that
line's page (`withConductLinePage` in the draft route); the loop's `propose_form` cited the heading's page (p.12).

- Fix here: `propose_form` reads the card's page through `withConductLinePage` over the card's own account, for the
  first and the second heading. A heading-only incident (rude to a guest) keeps the heading's page.
- Ask Sunny (origin/main 7a43ade4): the same lines, `src/lib/ai/agent-loop/tools.ts:3443` and `:3468`, against the same
  Create rule (`src/app/api/forms/instances/[id]/draft/route.ts:2382`). Port the mechanism (no wording to copy).
- Replay harness: the stand-in provider now answers the loop's `officialPolicyManualVersion` (null). Without it the call
  threw and every loop case read no manual (a card's policy was refused as read_failed). `t.manualIs` gives a case
  production's manual rows (`test/fixtures/jba-manual-production-151.json`). Sunny's harness already has the version check.
- Known gap, not changed here: the old chat path (loop off) has the same split: its card line (`POLICY_PAGE_ON_CARD`,
  `policy-page-on-card.ts`) names the heading's page.
