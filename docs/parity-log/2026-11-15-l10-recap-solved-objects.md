## 15 Nov 2026: DM L10 recaps read solved issues as plain titles or { title, owner }

QA, ahead of the Leadership Hub's recap change: new recaps will store each solved issue as `{ "title", "owner" }`;
recaps the Hub auto-saves stay plain titles. A reader that assumed strings would put an object in JSX and crash the
page. Every Ask Bubbles reader of `resolved_issues` now goes through `solvedTitle` / `solvedOwner` / `solvedIssues`
(`src/features/l10/lib/types.ts`): the recaps page, Past meetings, the report and the assistant's source viewer.
Anything that is neither shape is skipped. The newer optional recap fields `notes`, `todos_done` and `todos_total`
(possibly null) are typed and tolerated, not shown yet. End meeting still sends plain titles.

Sibling app: Ask Sunny has the matching mechanism on its unmerged branch
`claude/blissful-wozniak-fa6337-recap-notes` (readers plus the writer side); mirrored here without waiting for it to
merge, readers only. No port back needed from this change.
