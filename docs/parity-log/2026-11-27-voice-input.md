# VOICE_INPUT_ENABLED (Ask Bubbles, 27 Nov 2026): not ported to Ask Sunny

**Change in Ask Bubbles.** A mic in every AI chat box (main chat, the Overview ask band, a report's ask bar and the L10
tab assistant). One shared component (`src/features/voice/voice-button.tsx`) records up to 60 seconds; one route
(`POST /api/chat/voice`) checks the calling box's own access again, counts the clip against per-person, per-store and
company caps in the database (`voice_usage`, migration `20261127001000_voice_usage.sql`), and turns it into text with
AssemblyAI Sync (`src/lib/voice/transcribe.ts`). The text lands in the box; the person checks it and presses Send as
before. The agent loop, its tools, the prompt and the rules book are unchanged. Default off; on only for the server-side
pilot list `VOICE_INPUT_USERS`.

**Ask Sunny: not needed because Ask Sunny gets its own voice change in a separate pull request built from its own
prompt.** The owner asked for the two apps' voice changes to be built in parallel, each from its own instructions, and
not copied between them.
