## 12 Nov 2026: TERMINATION_CARD_TIDY stays Ask Bubbles only for now

QA's 17o live notes on termination (Bubbles main 815ae303): (1) "CA for <A>, do not terminate yet, she was late" made the
card's Issue "do not terminate yet"; (2) a term CA card's Action plan line ran into the next line with no blank line.

Checked on Ask Sunny (main 1ecadf923, its production flags, the same turns with an invented person):

- (1) does not reproduce. This app's Corrective Action card has no Issue line; its Observation of Offense reads "do not
  terminate yet, she was late" — the account is kept.
- (2) the termination card is not on Ask Sunny's main yet (S#869, TERMINATION_STATED_TICKS, in its gate). Its
  `ai/termination-stated.ts` has the same plan-line pattern ending in "\s*$", but there the Action Plan is the card's
  last line, so nothing runs on. The one-character fix ("[ \t]*$") can go into S#869 itself if QA wants it before
  S#869 merges; it changes nothing visible there today.
