## 4 Nov 2026: one writer for form edits, Step 2b — port follows (FORM_EDIT_SINGLE_WRITER_ENABLED, default off)

Step 2b, on top of 2a (#414). QA's conditions before the flag can be flipped:

- the correction path now applies `drops_words` (`keepsUnnamedWords`) and a
  new optional reducer rule, `droppedWordsReplaced` (with `wholeValueKeys`):
  a correction replaces only the words the manager named, and a dropped word
  must be replaced one for one by a word the correction adds;
- the 216 tests that changed with the flag on only for their harness now mock
  `instances.ts` with a `loadInstance` that returns the saved state
  (`src/test/forms/saved-form-instances.ts`), each with a flag-on variant
  (`*.single-writer.test.ts`); two regressions they found are fixed
  (`statedWrite` and unknown keys; a relative day on a draft's date line);
- a post-draft consistency check in the draft route (the header's name and the
  stated dates and amounts kept in the account; detect and report only, no
  retry; `slots.draft_check`).

Sibling app: it has the same code at these sites (the one writer, the
reducer, the draft route and the correction). Not ported in this change: as
in 2a, each Bubbles PR is followed by its own sibling port, built from this
branch once it merges. The protected revision hunk is not in this change (see
the PR description).
