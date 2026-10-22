# Ask Bubbles — QA summary for the full release (22 Oct 2026)

Branch `claude/lucid-shannon-v79zju`, pull request #69. The branch already contains production `main` `e7dd377`, the payroll-only release (pull request #67). All testing used synthetic data. No production or historical HR record was read or changed.

## In production since 22 Oct 19:00:51 UTC (pull request #67, `e7dd377`)
The payroll safeguards:
- A negated, waived, cancelled or withdrawn deduction is never saved as Yes. An unclear statement is cleared and asked, including after the form exists.
- A finalized form is corrected on a new draft.
- The Action Plan no longer prints "$25,".

This branch carries the same payroll files, byte-identical. Root cause and historical impact: `PAYROLL_DEFECT_ROOT_CAUSE.md`. The read-only HR audit plan: `hr-audit/`.

## Fixed in this release (each with a regression test that fails before the fix)
| ID | Defect | Commit |
|---|---|---|
| B3 | A reply of only "today" / "yesterday" ended the open form | `7e68a0e` |
| F-02 | A reply naming a store replaced the employee | `2d8725b`, `e8cdcc8` |
| F-03 | Dates: the form date is chosen by what each date means | `614e1fd` |
| F-03d | A date word ends the employee's name (guard test) | `999ac00` |
| F-04 | "write a …" was read as a Corrective Action request | `9ffbf5b` |
| F-05 | Times, prices and quantities are never stores (guard tests) | `cca056e` |
| F-06 | "both" or "either" was read as an employee | `6c5a14a` |
| F-07 / F-08 | Earlier coaching not recognised in natural phrasing; false escalation | `64fd694` |
| F-09 | A role or relationship before the name hid the employee | `d2589cb` |
| F-11 | Prior forms matched by name across stores; now attached only when the name is one person at this store | `95d0224`, `dea1646` |
| F-12 | Answering or correcting "Which store?" ended the open form | `e8cdcc8` |
| F-13 | Names were capitalised; the manager's spelling is now kept (reverses the 9 Oct rule) | `6ad7e59`, `2ea0a93` |
| X2 | "no, keep it verbal" (guard test) | `cf694d2` |
| LS-2 | The revocation local-database test proved a live session through a read that a migration had closed (test only; every termination assertion unchanged) | `82b34e3` |

Ports from the sibling app (mechanism only, Bubbles' own data) are listed in `docs/parity-log.md`.

## Changed test expectations
- **Spelling kept as typed:** reverses the 9 Oct owner rule in `owner-retest-e2e.test.ts`.
- **Test D form date:** changed from 10/21 to 10/20.
- **A copied fixture id:** replaced with a Bubbles store.
- **The revocation liveness checks (LS-2):** now go through the API.

No assertion was deleted, skipped or loosened. There is no `.skip`, `.only` or `.todo`.

## Release decisions
See `RELEASE_DECISIONS.md`.

## Not in this release
- **R1:** a lower-case name in "…what should I do?" gets no form suggestion.
- **N5:** an admin's bare "264" with no store question open ends the intake.
- **F-10:** district managers cannot file until verified assignments exist (fail-closed).
