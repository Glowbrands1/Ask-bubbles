# 2026-11-21 — progress stream (version 2): ported, no turn enables it yet

**Ported from Ask Sunny (1e11feb1, #1066, the progress-status part only).** Loop port, Phase 2 (infrastructure only):
`streamed-response.ts` gains the version-2 stream (`PROGRESS_HEADER`, `progressChannel`, `wantsProgress`,
`readStreamedLines`); the client provider sends the header only when the screen passes `onProgress`, reads version 2
line by line, and `ThinkingBubble` shows the latest status. A turn sends version 2 only when the route enables its
progress channel, which only the agent loop's branch does in Sunny; this app has no loop yet and the chat route is
unchanged, so every answer is the version-1 stream byte for byte and nothing a manager sees changes. The route hook
comes with the loop (Phase 3+4).
