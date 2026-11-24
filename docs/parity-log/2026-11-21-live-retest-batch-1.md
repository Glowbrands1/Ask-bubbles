# 2026-11-21 — live re-test batch 1 (items 1–5)

**To be ported to the sibling app** (its own draft pull request; Coding-E owns the ports): the sibling app's agent
loop has the same code for each of these, so each bug is there too.

- 1 (code): a name corrected mid-chat replaces every spelling of that person in the card's account and the saved
  write-up (sibling `tools.ts` proposeForm, same spot).
- 2 (code): a card made at the step limit says what changed (form switch, corrected name, person and store) and
  never asks for the change again (sibling `run.ts` stepLimitReply).
- 3 (code): once set, the card's form date stays until the manager changes it (sibling `tools.ts`, same spot).
- 4 (code): a dashed date ("10-1-26") is the same date as "10/1/26", so the saved Observation states the offense
  once (sibling `account-facts-kept.ts` sameDates).
- 5 (code + instruction): a corrective-action account with no subject is refused with `account_no_subject`, and the
  issue line's dates are slashed (sibling `tools.ts` and rules book).

Items 6 and 7 have their own entries: `2026-11-21-card-page-is-the-quoted-line.md` (ported) and
`2026-11-21-manual-says-store.md` (Bubbles only).
