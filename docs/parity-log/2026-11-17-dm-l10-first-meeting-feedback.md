# 17 Nov 2026: BCS DM L10 changes after its first meeting — Bubbles-only

Marissa's email after the first BCS DM L10 run in Ask Bubbles, item by item:

- Segue ("AI Share Tab"): no icebreaker question box, no round-robin check-off.
- Metrics: "Add metric" is a button next to "Add week" that opens the form.
- Rocks: only people with rocks are listed; a milestone can be checked off in
  the expanded list, without opening the rock.
- Issues: the priority circles are numbered 1, 2, 3 in the order they were
  picked (`priority: true` kept for the Hub, plus `priorityOrder`).
- Every page: the New Issue banner is a floating button that opens a window (as
  the Add to IDS button on the other meetings), so IDS has one add field.

**Sibling app: not ported.** Ask Sunny runs the same code for the STC DM L10
(its `bloomStyle` meeting). These are one team's layout choices, not bugs, and
changing that code there would change the other company's meeting without a
request from its team. If they ask for any of them, port the mechanism: the
`bloom` branches in `MeetingView.tsx`, `BloomShell.tsx` (`NewIssueButton`),
`Scorecard.tsx`, `Rocks.tsx`, `Ids.tsx` and `lib/priority.ts`. The Leadership
Hub's own page for the BCS DM L10 is unchanged (it still shows the icebreaker
and round-robin); the data written here (`priorityOrder`, unchanged
`segueQuestion` / `shared`) is kept by the Hub.

Not done: the chat bubble inside the meeting for store figures ("what is
Bellevue's Labor PTD"). The meeting already has the L10 assistant (bottom
right), which reads the meeting and its recaps; store reports are not built yet,
so it cannot answer that until they are.
