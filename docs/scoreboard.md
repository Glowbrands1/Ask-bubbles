# Replay scoreboard

Local harness only. `proposeFormForTurn`, temperature 0, empty roster, owner
with global scope, today 2026-10-24. The model is the configured answering
model and is not called. A case passes only when every flags-on run passes.
Flags-off is the same card rules and is allowed to fail them.

Pass criteria were written in `src/lib/ai/replay-set.json` before the run.
They are judged on the card: employee, store, date, policy and printed page,
no blocking question, no leaked internal text, and latency under 8000ms.
A blank first message is a harness event (`dropped_first_message`), not a
case failure. This run had no harness events.

## Round — anti-loop — 24 Oct 2026

| | |
| --- | --- |
| replay_set.json | `b880bb5d80810302ac9ece8c5042f9cae1104eef10ee538516871be4ac3970fe` |
| commit | `dfb988d7e90e267be96fe9f722a2bd539eab49b5` |
| prompt hash, flags on | `13a74bd2194bab22c8aed6628f9383a5aee4ad4d60e67e1f46d374e37adf8e9e` |
| prompt hash, flags off | `b70bdf29016c52e5857240b7eb2323dcd0f40600c005e9b36172638c72b87878` |
| flag set, on | `TYPED_NAME_ENABLED`, `ACTION_PLAN_SENTENCES_ENABLED`, `PRINTED_PAGE_ONLY_ENABLED`, `POLICY_CITATION_ENABLED`, `PAYROLL_DEDUCT_AMOUNT_ENABLED`, `ANTI_LOOP_ENABLED` |
| flag set, off | none of those |
| model | `claude-sonnet-5` (configured, not called) |
| runner | `proposeFormForTurn` |
| temperature | 0 |
| runs | 3 flags-on, 1 flags-off |

| Case | Flags off | Flags on |
| --- | --- | --- |
| b9 Test Employee, written CA | FAIL. No employee on the card. Turns 1 and 3 ask who. | PASS 3/3. Slowest run 156ms. |
| b10 Testy Testerson, Dodge, measuring | FAIL. Turn 1 has no employee. "show draft" has no card. The incident is treated as missing. | PASS 3/3. Slowest run 79ms. |
| b11 Testy Testerson, late, Attendance | FAIL. Asks which of NE, Testy Testerson, or JBA Manual. | PASS 3/3. Slowest run 10ms. |
| b12 Sadie Hoffart, Empire SD | FAIL. No employee. Turn 5 reads Store Director and asks who. | PASS 3/3. Slowest run 55ms. Store blank. Animals in the Workplace p.30. Visitors not required. |

The five-flag replay without `ANTI_LOOP_ENABLED` is unchanged: b9–b11 pass,
and b12 still asks once with the two Sioux Falls stores and still misses
Visitors in the Workplace. That miss stays. This round does not require
Visitors. Animals in the Workplace p.30 is required because the manager
names that heading.
