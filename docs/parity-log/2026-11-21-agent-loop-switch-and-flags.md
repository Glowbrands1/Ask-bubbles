# 2026-11-21 — agent loop: the switch and the loop's missing flags (loop port, Phase 2)

**Ported from Ask Sunny** (`agent-loop/switch.ts`, identical to Sunny main; the flag functions of Sunny's
chat-quality-flags.ts). The loop's files call 20 flag functions; this app lacked 4, added here, default off and listed
"off": AGENT_LOOP, CURRENT_MANUAL_SCOPE, MANUAL_SECTION_DEDUPE, NEAR_MISS_NEVER_SEATED (each _ENABLED). Sunny's
GLOBAL_SALON_ASK_ENABLED is this app's GLOBAL_STORE_ASK_ENABLED, already here. The ported helpers' only missing flag,
EXCERPT_EMPTY_CARD_DROP_ENABLED, is not added: its mechanism is gated on this app's own EXCERPT_BRAND_HEADING_DROP
(on in production), which does the same job. AGENT_LOOP_USERS gates the loop per user as in Sunny (unset or empty:
nobody). Nothing outside src/lib/ai/agent-loop/ imports these files (no-import guard), so today's chat is unchanged.
Supersedes the switch.ts and guard of Bubbles #935.
