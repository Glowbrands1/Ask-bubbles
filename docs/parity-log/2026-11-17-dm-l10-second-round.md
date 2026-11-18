# 17 Nov 2026: BCS DM L10, the owner's second round — part ported to Ask Sunny

After the first round merged (#953), the owner asked for:

- clearer dividers and card edges on the blue canvas;
- scorecard figures that are easier on the eyes (Public Sans, medium weight, tabular digits, not bold monospace);
- "AI Share" renamed "Recap" on the BCS DM L10 (display only: `SECTION_TITLE` in `src/features/l10/lib/config.ts`);
- to-dos: a due date when adding and in each to-do's details; Archive / Archive done and a History tab with Restore
  and Delete (`src/features/l10/lib/todoHistory.ts`, kept in the meeting document as `todoHistory`, which the Hub keeps
  and does not show); a new meeting moves done to-dos to History instead of dropping them;
- "Take the lead" for anyone in a running meeting (Pause / Resume / Reset), an "End meeting" button that goes to the
  last page, and the leader shown by name instead of sign-in email.

**Sibling app.** The owner then asked for two of the first round's changes in Ask Sunny's STC DM L10: one place to add
an issue (the New Issue banner was shown twice on the To-do and IDS pages) and numbered 1, 2, 3 priorities on IDS.
Those two mechanisms are ported there (`NewIssueButton`, `lib/priority.ts`). The rest stays Bubbles-only until Ask
Sunny's team asks: they are this team's layout and wording choices.
