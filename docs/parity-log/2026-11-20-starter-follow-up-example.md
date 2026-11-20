# 2026-11-20 — a home starter's follow-up carries one example answer (port from Ask Sunny #1127 and #1150)

**Sibling app: ported from Ask Sunny #1127 (main `c2b17d2a`) and its follow-up #1150 (head `4ecee140`, open when this
was ported).**

- `ai/starter-follow-up.ts`, behind `STARTER_FOLLOW_UP_EXAMPLE_ENABLED` (default off; not in `production-flags.json`'s
  "on": QA flips it). #1150's shape from the start: a table keyed to every starter in this app's own `QUICK_QUESTIONS`
  that is answered with a who or which question ("Create a coaching form.", "Help me prepare for a conversation with a
  team member.", "What should I tell a guest who asks about an ingredient?"), the who-question matched loosely (any
  "Who is this / it … for …?", bold or not). The examples are this app's own store wording, not Sunny's.
- Applied outermost in `answerQuestion` (server-ask.ts). #1150's agent-loop step (run.ts): not ported, no loop here.
