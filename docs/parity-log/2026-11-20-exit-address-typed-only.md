# 2026-11-20 — the exit form's Permanent Address is only ever the manager's own (port from Ask Sunny #1119)

**Sibling app: ported from Ask Sunny #1119 (main `e7ffb038`), the non-loop half.**

- `exit-details.ts`: `addressTypedIn` and `withoutUntypedAddresses`, as in Sunny.
- `draft-notes.ts`: `notesWithoutCardLines` (the card's own lines, `draftNotesFromCard`, are not the manager's words).
- Draft route (`api/forms/instances/[id]/draft`): on every exit form, the Permanent Address read from the notes is kept
  only when it is in the manager's own lines. Bubbles has no agent-loop card; its card lines reach Create when no
  manager turn qualifies (`NEXT_PUBLIC_REMAP_DRAFT_SOURCES_ENABLED`, off in production), and the client now says so
  (`notesFromCard: true`, Sunny's `cardFromLoop`). Those notes also lose a labelled address nobody typed before the
  model reads them, so it reaches neither the details nor the drafted text.
- Agent-loop parts (propose_form's account, edit_form replay guard): not ported, no loop here.
