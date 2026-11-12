## 25 Oct 2026: a turn never saves or shows an empty reply (from Ask Sunny 9fabb22)

`EMPTY_REPLY_GUARD_ENABLED` (default off), plus two unflagged client fixes: a
200 without an answer is a failed turn, and the stored error keeps the
server's code and status (an auth refusal reads as signed out). Bubbles-only
on top: this app's answers can carry several form cards (`formProposals`),
which also count as an answer; Ask Sunny's answers have no such field, so
nothing to port back. Test: `src/app/api/chat/empty-reply.test.ts`. Rebuilt
on main on 11 Nov 2026 (QA's stale-PR cleanup of #141); replay case
`nov11-empty-reply-guard-policy-question`.
