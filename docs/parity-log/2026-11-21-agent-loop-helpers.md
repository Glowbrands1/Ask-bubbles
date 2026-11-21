# 2026-11-21 — the agent loop's pure helpers (loop port, Phase 2)

**Ported from Ask Sunny** (mechanism only, unused until the loop is ported; nothing on today's chat path imports them):
`forms/follow-up-default`, `forms/this-persons-turns`, `forms/termination-word`, `knowledge/current-manual-scope`,
`knowledge/empty-card-drop` (`shownCitations`), `employee-match.saysNo`, `specific-policy-topics.topicHeadings`, and
`isJobTitlePhrase` / `tidyTypedName` in a new `forms/proposal-names.ts` (this app's `forms/proposal.ts` is protected; the
loop imports them from `proposal-names` here). Supporting exports: `edit-date-rules.followUpDatesByRules`,
`hybrid-rank.isPolicyManualChunk`. Differences from Sunny: `empty-card-drop` is gated on this app's own
EXCERPT_BRAND_HEADING_DROP (on in production; same job as Sunny's EXCERPT_EMPTY_CARD_DROP) and reads its hidden brands
from `config/company/knowledge`; comments and tests use store wording and invented names.
