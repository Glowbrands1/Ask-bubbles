# 2026-11-20 — every deleted form leaves a permanent record (port from Ask Sunny, f066)

**Ported from Ask Sunny** (`bdaa2ec`, board f066; Pau approved 20 Nov 2026). Same gap here: `form_instance_events`
goes with the form (cascade) and nothing else recorded a delete. Ported as is: migration
`20261120001000_form_instance_deletions.sql` (append-only `form_instance_deletions`, a BEFORE DELETE trigger on
`form_instances`, UPDATE/DELETE refused, server-only), the app's stamp of who/role/how before its deletes
(`deleteInstance` / `deleteDemoInstances`; route, chat, demo sweep), the fake's model of the trigger, and the PGlite
test. Not ported: Sunny's agent-loop `read_form_deletions` tool (this app has no agent loop); instead the chat reads
it through a FORM DELETION RECORD block (`form-deletions-chat-read.ts`, administrators only), with its own replay
cases (`nov20-form-deletion-record-cases.ts`). Store/Forms Register wording; no Sunny content.
