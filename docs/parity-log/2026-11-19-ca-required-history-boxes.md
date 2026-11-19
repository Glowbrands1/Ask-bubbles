## 19 Nov 2026: Corrective Action history line becomes two required boxes (revision 8) — port from Ask Sunny

Ported from Ask Sunny's revision 9 (see its parity-log entry of the same date,
`2026-11-19-ca-required-history-boxes.md`). HR via Pau, for both apps: the line
"List previously received coaching and/or corrective action with date signed"
is replaced by two boxes the form creator must fill in — "List date of JBA
policy manual signed by employee" and "List previous coaching and corrective
actions and include date signed by employee in past 90 days".

What differs in Ask Bubbles, and why:

- **Revision 8, not 9.** Bubbles' Corrective Action seed was at revision 7.
- **Parity test.** `template-parity.test.ts` compares the seeds with Ask
  Sunny's published snapshot: the new box is set aside in that comparison (like
  the payroll amount line), and the box's label, help and `required` mark and
  the revision note are on the approved list as HR-1 in
  `approved-template-changes.json`.
- Everything else is the same code: the `required` field mark,
  `REQUIRED_FIELDS_AT_FINALIZE_ENABLED` (default off), the 422 at Finalize,
  `prior_actions` keeping its key so the chat reads and writes box 2, and box 1
  left to the form creator. The manual's name stays "JBA Policy Manual".
- Chat edit of box 1 ("set the manual date to 01/01/2026") is ported too: the patch path writes it as the creator's own edit, in their words only.
