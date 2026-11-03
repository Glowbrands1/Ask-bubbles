## 4 Nov 2026: corrections, redrafts and copies through the form reducer (FORM_PATCH_ALL_PATHS_ENABLED, default off) — Bubbles first; the sibling app later

Step B, all paths (`src/lib/forms/form-reducer-paths.ts`, see
`docs/step-b-reply-rewrites.md`). Built here first. The sibling app needs its
Step B (the reducer, the patch turn and the claim rule) merged before this can
be ported; then the mechanism is ported, not the wording.

Known gaps, logged as QA asked:

- **Q3: the non-Corrective-Action name correction does not move the
  `employee_name` column.** On a Coaching Form, "fix her last name …" (read as
  "change her name to …") writes the Employee Name line only; the card, the
  Forms Register and the printed form read `form_instances.employee_name`, which
  keeps the old name. Only the Corrective Action path
  (CA_NAME_FROM_CHAT_ENABLED) moves the column. Not changed here, by QA's
  ruling.
- **H2: the honest-reply write on an asked-question turn is not built.** QA
  ruled (Q2) that a question never writes a form field, so "…should that go on
  the form too?" changes nothing and `honestFormReply` stays the net. The case
  stays open.
- **Revision (`chat-revision.ts`) is pending the owner.** It is a protected
  file; its edit (proposal path 3) waits for the owner's yes on the exact diff.
  Until then a revision is checked only by `checkedClaim`.
- **Reader values count as said (QA's rule, #410).** A correction value the
  correction path's own deterministic readers produced from the manager's
  words ("$15" → `$15.00`, "SD" → `Store Director`, "she texted me she quit" →
  `Text message`, "she told me verbally" → `Verbal`) counts as an accepted
  offer for the value's-words check only (`sources.readerValues`, passed only
  by `saveCorrectionPatched`). Evidence must still be her words; a model's
  value never benefits. Port this with the rest.
- **Pre-existing bug, not fixed here (its own PR later):** "fix her last name
  its Pike" is read as "Wrenna its Pike" — NAME_CORRECTION_WORDS keeps "its" as
  part of the last name, and the name is written.
