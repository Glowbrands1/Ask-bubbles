# 2026-11-20 — the cross-chat draft lookup returns only a draft the caller may see

**Stays Bubbles-only: Ask Sunny has no cross-chat draft lookup** (no `findCrossChatOpenDraft` or
`CROSS_CHAT_DRAFT_DEDUPE_ENABLED` on its main). QA's audit (P2): with the flag on, the create route's lookup read every
open draft for the template and date with the service-role client and could return another manager's draft at a store
the caller cannot see. A picked draft is now returned only when `visibleInstances` lets the caller see it (the Forms
Register's rule), and with DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED only the caller's own drafts count as "this chat's".
