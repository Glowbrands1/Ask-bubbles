# Bubbles-only: EXIT_ANSWER_NOT_A_CORRECTION_ENABLED, and the name on its own line it must keep

EXIT_ANSWER_NOT_A_CORRECTION_ENABLED (B#623) stops an exit answer's "not returned" / "not eligible" / "does not apply"
from making the turn a name correction (`forms/proposal.ts` settle). The Bubbles gate runner (R6-2, 8 Nov 2026) found
it overreached: in an exit form typed as lines ("Thessaly Varrow\nTeam Member Part Time\n…\nStore items returned payroll
deduction does not apply eligible for rehire"), "does not apply" was the turn's only negation, and only that spurious
correction read the name on its own line. With the flag on, the card asked "Who is this Resignation/Exit Form for?".
Narrowed: when the only negations dropped were exit terms, a name that is a whole line by itself is still the answer
(lines only, never the clauses a correction reads, so #623's one-line turn 1 still names no clause as a person).

Not needed in the sibling app: it has no EXIT_ANSWER_NOT_A_CORRECTION code (its settle keeps every negated word), and
its own parity entry (branch claude/exit-answer-parity-log, 8ebce5d6, 8 Nov 2026) records why: an exit card there is
read from the whole manager window, so the cut #623 fixes never reaches it. Without the filter there is nothing that
could drop the name line.
