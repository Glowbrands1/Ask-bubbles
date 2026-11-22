# The exit type the card ticks is always read back (QA's flaky check, U24)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts`, `src/lib/ai/agent-loop/run.ts`.
- The exit card's ticks (`exitCardTicks`, the card's own facts) are now also reads_back's first line ("Filed as: <ticks>.").
- run.ts adds that line after the reply's opening paragraph when the reply names none of the ticked types.
- The rules book says the line once.
- A termination keeps its own exit_termination line, as before.

Report: on main f712228, "… Immediate Vol Resignation …" ticked Immediate Voluntary Resignation. In one of five live
runs, the reply read back every reads_back line but never said the type. The exit_ticks rule is a separate line the
model can skip.

**Ask Sunny: same gap, port pending.** Sunny's exit card gives its ticks only as `exit_ticks`, with the same rules-book
line, and nothing adds them when the reply leaves them out. The port is held until this passes QA's live run. It goes
to the Sunny coder through QA, titled `Port from Ask Bubbles (<sha>): …`.
