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
- **Reader-normalised values are refused with the flag on.** The correction's
  reducer rules (the name on the form as the only accepted offer) refuse a
  value whose words the manager did not say: "$15" read as `$15.00`, "SD" as
  `Store Director`, "she texted me she quit" as `Text message`. Nothing false
  is written or claimed, but the correction is not made. Needs QA's decision
  before the flag is turned on.
- **"fix her last name its Pike"** is read (NAME_CORRECTION_WORDS, unchanged)
  as "change her name to … its Pike"; the reducer passes it (every word was
  said). A reading gap, not this flag's.
