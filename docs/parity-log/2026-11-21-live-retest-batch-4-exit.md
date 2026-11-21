# 2026-11-21 — live re-test batch 4, items 19–23

**To be ported to the sibling app** (its own draft pull request): the sibling app has the same code for each.

- 19 (code): the card keeps the name the manager typed last (sibling `agent-loop/tools.ts` nameAsSaid).
- 20 (code): a notice being served now ("is fulfilling them") is a resignation with notice, and the person's other
  roster name is an alias, so the first turn stays this person's request (sibling `forms/exit-facts.ts`, `tools.ts`
  aliases).
- 21 (code): an exit reason ends where the manager's words to the app begin ("I'm ready for the draft")
  (sibling `forms/exit-details.ts` REASON_END).
- 22 (instruction): a shift missed without coverage is Attendance (Shift Replacement when the manager names that
  policy); an acknowledged policy is background, never the offense (sibling rules book).
- 23 (code): an inactive person gets one statement (`inactive_in_woven` only, plus a reply guard), and Create strips a
  trailing read-back note such as "(from your words)" from a saved value (sibling `tools.ts`,
  `forms/instances/route.ts`).

Items 24 and 25 have their own entries (`2026-11-21-loop-card-never-copied-over.md`,
`2026-11-21-attendance-kind-asked-beside-card.md`).
