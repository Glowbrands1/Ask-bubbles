# 2026-11-21 — AI time limits, the model-call scope and the trace's loop fields (loop port, Phase 2)

**Ported from Ask Sunny** (e0265390, 4955f195, 057a6c62: QA's 14 Nov time limits; 1e11feb1's model-call-scope /
countedClient; #1161's per-call stream watch; the chat trace's `slots`, `firstTokenMs` fallback and `finishChatTrace`'s
`{ awaitWrite }`). Closes the gaps listed in Sunny's `docs/parity-log/2026-11-14-ai-time-limits.md`: every AI call ends at
its limit with the manager-facing 504 message and one `[ai.timeout]` log line (main answer: 45 s to the first token, 30 s
between chunks, 110 s in all, ending before the route's maxDuration; helpers 30 s; the reader and form patch keep their
limits, now in `config/ai-timeouts.ts`), and failures write `[ai.failure]` lines. Built into this app's own call-claude
structure (its prompt caching and inputs untouched). The L10 assistant's local stand-ins now use the shared helpers (same
values and log line). Not ported yet: the drafting route's direct call (QA: create/draft route hooks later), the agent
loop itself, and Sunny's MODEL_RETRY_ENABLED options (this app keeps the SDK's 2 retries). The protected
`forms/chat-revision.ts` change is in `docs/patches/ai-time-limits-chat-revision.patch` for Pau's approval.
Supersedes #935's time-limit files (stale against Sunny main).
