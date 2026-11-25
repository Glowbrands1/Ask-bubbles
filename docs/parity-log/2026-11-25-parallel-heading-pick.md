# CHAT_PARALLEL_REWRITE second half (Ask Sunny, 25 Nov 2026): not needed in Ask Bubbles

**Change in Ask Sunny.** The owner asked for faster Quick and Detailed answers without changing what Sunny says. Sunny's
older chat path (`src/lib/ai/server-ask.ts`) ran three steps one after another before the answer: intent extraction,
the message normalizer and the search rewrite's heading pick, 2–6 s together. Under CHAT_PARALLEL_REWRITE_ENABLED, the
normalizer and now the heading pick (`manualHeadingQuery` in `src/lib/ai/query-rewrite-claude.ts`) start as the turn
arrives, and each is used only for the same turn; otherwise it runs again where it always ran. The flag is turned on in
Sunny's production.

**Ask Bubbles: not needed.** In this app's production, QUERY_REWRITE_ENABLED and INTENT_EXTRACTION_ENABLED are both off
(`src/config/production-flags.json`), so neither the normalizer nor the heading pick runs on the chat path, and this app
has no CHAT_PARALLEL_REWRITE flag. There is nothing to start early. If QA turns the query rewrite on here, port
`manualHeadingQuery` and the early start with it.
