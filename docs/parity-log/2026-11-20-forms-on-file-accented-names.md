# 2026-11-20 — accents never hide a form on file (port from Ask Sunny #1171)

**Sibling app: ported from Ask Sunny #1171 (main `121c67ab`).**

- The readers' half (`candidateNameWords`, the row's name words, `looksLikeItNamesSomebody`, the close-spelling reader)
  already folds accents here: it landed with this app's port of #1141 (#974).
- The database half: migration `20261120002000_forms_overview_unaccent.sql` (**not applied by the pull request**; QA
  applies it after merge) installs `unaccent` in the `extensions` schema and adds `employee_name_folded =
  lower(unaccent(employee_name))` as the overview's last column. The view's other columns are this repository's last
  definition (`20260904004000_forms_follow_up_tracking.sql`), the same as the sibling's. `listInstances` matches it
  beside `employee_name`; until the migration is applied, a read that names the missing column is read again by the
  stored name only, as before.
- Kept here: #974's extra read of an accented question's old letter pieces ("ram", "rez"), so a name stored with its
  accent is still read before the migration is applied.
