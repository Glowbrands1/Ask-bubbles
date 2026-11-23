# Woven content POSTs carry the page's anti-forgery token in a header (WOVEN_POST_ANTIFORGERY_HEADER_ENABLED)

**Fix (Ask Bubbles):** `src/lib/knowledge-sync/woven/http.ts`, `web-app.ts`, `config.ts`, `sync.ts`,
`part-preview.ts`; default off (`src/config/production-flags.json`).

QA's Preview scan 6c1297da (23 Nov 2026) listed policies from GET /Policy, but the four other lists failed:
"Woven answered /KnowledgeCenter/_Handbooks_List_ForDataTable with HTTP 400." (and the same for
`_Search_Procedures`, `_FileLibrary_Management_List_ForDataTable` and `/Communication/_List_ForDataTable`).
The scheduled syncs' `_Policies_List` failed the same way from 19 Nov; the last good runs were on 12 Nov, and
the sync code did not change in that window. Every failing read is a POST and every GET works, so Woven now
checks an anti-forgery token on content POSTs: an ASP.NET JSON post sends it in a header, and an empty 400 is
how the check refuses. With the switch on, each content POST carries the latest authenticated page's
`__RequestVerificationToken` in the header the page's ajax set-up names (default `RequestVerificationToken`).
Audience and publication rules are unchanged. Tests: `woven/bcs/post-antiforgery-header.test.ts`, against
a fake Woven that refuses content POSTs without the token, as both apps' runs recorded.

**The sibling app: same failure, port pending.** Its knowledge_sync_runs show every POST list (handbook,
procedure, file_library, knowledge_element, course) failing with `woven_bad_response` from 19 Nov, while its
GET policy list works. Its `http.ts` is the same client (`ANTIFORGERY_HEADER = null`, no header sent), so the
same change applies to it. This session has read access only to the sibling app. The port goes to the sibling's
coder through QA, titled `Port from Ask Bubbles (<sha>): …`.
