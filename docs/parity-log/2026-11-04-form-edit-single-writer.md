## 4 Nov 2026: one writer for every form edit, Step 2a — port follows (FORM_EDIT_SINGLE_WRITER_ENABLED, default off)

Step 2a of the single-writer design (STEPS_2_6_DESIGN, 4 Nov 2026). Every
unprotected path that edits an open draft — chat correction (header lines,
Corrective Action facts and dates, the form readers), redraft (the draft
route's write and its stated facts), same-form copy, policy change, reopen,
the Action Plan's sync and the patch turn — hands its values to
`writeFormEdits` (`src/lib/forms/form-write.ts`), which runs them through the
form reducer all or nothing and saves through the existing writers. New
optional reducer rules: `drops_words`, the strict naming turn (owner's Q2),
`writein_without_box`, and the protected values (QA condition 2).

Sibling app: it has the same code at the sites the design
lists (its correction, draft route, copy, policy change, reopen and plan sync,
plus `chat-reopen.ts:198`). Not ported in this change: the design orders each
Bubbles PR to be followed by its own sibling port, built from this branch once
it merges. The protected `chat-revision.ts` edit (2b) waits for the owner in
both apps.
