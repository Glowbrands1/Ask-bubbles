# 2026-11-21 — a loop card's Create saves the card, never an older form copied over it

QA's live re-test (21 Nov 2026, Pau's account, agent loop on), item 24: after "Do the same coaching form for <B>", <B>'s
card showed the manager's own steps and Create saved an older Coaching Form's text (about something else) instead.

- Cause: the draft route's implicit copy (SAME_FORM_COPY_ENABLED). The loop's card cites the turn that names <B>, so
  that turn is the last of the notes, it reads as a copy request, and with <A>'s card never created the copy took this
  account's newest other Coaching Form.
- Fix (code): `implicitCopyAsked` in `lib/forms/same-form-copy.ts` is false for a loop card (`cardFromLoop`); the app's
  own path still copies as before. Replay `nov21-agent-loop-same-coaching-saved-as-card` (+ the control
  `nov21-agent-loop-same-coaching-not-loop-still-copies`).
- **Sibling app: same bug, not ported in this change.** Ask Sunny `main` (7a43ade4) runs the same implicit copy for a
  loop card: `src/app/api/forms/instances/[id]/draft/route.ts:598` (`copy.asksForSameForm(copy.requestTurn(notes))`,
  no `cardFromLoop` check). To port: the same helper and the same one-line change, with the replay case in its pack.
