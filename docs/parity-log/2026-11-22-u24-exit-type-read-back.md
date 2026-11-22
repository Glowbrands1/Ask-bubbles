# The exit type the card ticks is always read back (QA's flaky check, U24)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts`, `src/lib/ai/agent-loop/run.ts`.
- run.ts adds the line "Filed as: <ticks>." after the reply's opening paragraph when the reply names none of the types
  the exit card ticks (`exitCardTicks`, the card's own facts).
- The model's input is unchanged. A first version also put the line in reads_back, and QA's live check saw
  `nov22-b6-rehire-stated-is-read-back-as-saved` lose its reads_back with it.
- A termination keeps its own exit_termination line, as before.

Report: on main f712228, "… Immediate Vol Resignation …" ticked Immediate Voluntary Resignation. In one of five live
runs, the reply read back every reads_back line but never said the type. The exit_ticks rule is a separate line the
model can skip.

**Ask Sunny: same gap, port pending.** Sunny's exit card gives its ticks only as `exit_ticks`, with the same rules-book
line, and nothing adds them when the reply leaves them out. The port is held until this passes QA's live run. It goes
to the Sunny coder through QA, titled `Port from Ask Bubbles (<sha>): …`.
