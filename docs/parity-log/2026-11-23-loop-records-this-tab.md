# One tab never gets another tab's card; the home band sends its conversation id (QA, 23 Nov 2026)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/card-record.ts` (`readLoopRecords`' `thisTab`), `run.ts`,
`src/features/chat/use-inline-ask.ts`.

The open chat's id is in the address (`?c=<id>`), and the chat screen adopts it on load, so a second tab opened on it
(Duplicate tab, a copied address) posts to the same conversation id. The loop's records are read by conversation id,
so that tab's turn took the first tab's card as the chat's card (its reply checked against it, its carries read from
it). A record now counts only when it is this request's own: its message is one of this history's manager turns (by id,
or by question key), or it is older than the earliest record that is (the history sent is the latest 20 turns). A tab
with no turns yet has none, and with nothing of the history found every record counts, as before.

The home band (`use-inline-ask.ts`) never sent its conversation id, so every turn asked there was traced with no
conversation (the 16 Nov "turn 1 NULL" symptom). It sends the thread's own id from its first question.

Replay: `nov23-two-tabs-one-conversation-no-crossed-card` (two threads on one conversation id; fails on main, passes
here; the replay harness's `thread()` takes a conversation id and an id prefix). Unit: `use-inline-ask.dom.test.tsx`.

**Ask Sunny: same gaps, port pending.** Sunny's `readLoopRecords` reads by conversation id the same way, its chat screen
adopts `?c=` the same way, and its `use-inline-ask.ts` sends no conversation id. This session has read access only to
Ask Sunny; the port goes to the Sunny coder through QA, titled `Port from Ask Bubbles (<sha>): …`.
