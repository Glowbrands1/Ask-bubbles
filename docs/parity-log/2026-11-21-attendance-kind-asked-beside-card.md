# 2026-11-21 — an Attendance CA whose kind was not said gets its card, and the kind is asked beside it

QA's live re-test (21 Nov 2026, Pau's account, agent loop on), item 25: "create ca form for <A> for violating attendance
policy on 10-20-26. verbal. no payroll deduct. jba manual 1-1-26 for previous coaching" got no card, only "absent, late,
or left early?", and "verbal" got the same question again.

- Cause (code): propose_form refused every Corrective Action card citing Attendance without an attendance kind
  (`attendance_not_given`, `lib/ai/agent-loop/tools.ts`), whatever the manager's words said.
- Fix: where this request's words describe no kind (`attendanceKindSaid`, `lib/ai/agent-loop/attendance-said.ts`), the
  card is made with what is known and carries `attendance_not_said` (the one question, then `asked_before` on later
  cards, from the card records); where the words describe one, the refusal stands. Rules book (`config/company/agent-loop.ts`)
  and the tool description (`run.ts`) say so. Replay `nov21-agent-loop-attendance-kind-asked-beside-card` and the guard
  `nov21-agent-loop-attendance-kind-described-still-required`.
- The pack's knowledge mock gained `officialPolicyManualVersion` (as the sibling's pack has): without it the loop's manual
  read threw in this pack and no loop case ever saw a manual heading. Every loop case still passes with it.
- **Sibling app: same bug, not ported in this change.** Ask Sunny `main` (7a43ade4) refuses the same way:
  `src/lib/ai/agent-loop/tools.ts:3889-3891` (`attendanceCard && !attendanceKind` → `attendance_not_given`). To port:
  the helper, the same condition and fact, and the rules-book line in its own content config.
- Known, unchanged: Create from a card with no kind drafts as an undescribed Attendance offense did before (the draft
  route's Attendance reading may default the box to tardiness) until the manager says the kind.
