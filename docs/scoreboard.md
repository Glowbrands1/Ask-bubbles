# Replay scoreboard

Local harness only. `proposeFormForTurn`, empty Woven roster, owner with
global scope, today 2026-10-24. The model is not called. A repair stub is
used only for the self-check probe: when the check says a name is not on
the roster, the stub returns "I couldn't find that person in the Woven
roster." and no longer names them. That is what the repair instruction in
`8f7cf6d` tells the model to do.

The code under test is `main` at `655a61dbebccd34405b53e40e0566a294120b0b8`.
No production database. No prompt was reverted.

## Cases

b9–b12 are the Buff City Soap turns, word for word.

The 14 priority chats are adapted from Ask Sunny. Store, not salon. Team
member and store director, not a tanning title. Kearney is `loc-66`,
Bellevue is `loc-67`, Lee's Summit is `loc-219`, the two Sioux Falls stores
are `loc-225` and `loc-338`. The other company's people and cities are not
in the turns. Nobody in the turns is on the roster.

## Round — main baseline — 24 Oct 2026

| | |
| --- | --- |
| commit | `655a61dbebccd34405b53e40e0566a294120b0b8` |
| runner | `proposeFormForTurn` |
| roster | empty |
| flags off | 7/18 card checks pass |
| each flag alone | same 7/18, same misses, on every flag |

`DRAFT_MERGE_ENABLED` is the same switch as `DRAFT_EDIT_MERGE_ENABLED` and
was not run as a second column. The other flags in
`CHAT_QUALITY_FLAG_NAMES` were each turned on alone. None of them changed
a card field versus flags off. The card path does not call self-check.

| Case | Flags off, and each flag alone |
| --- | --- |
| b9 Test Employee, written CA | FAIL. No name. Asks who the form is for. |
| b10 Testy Testerson, Dodge, measuring | FAIL. Name is kept. The measuring and weighing offense is not on the card. |
| b11 Testy Testerson, late, Attendance | FAIL. No name. Attendance is not cited. |
| b12 Sadie Hoffart, Empire SD | FAIL. No name. Role is read as Store Director. Animals in the Workplace is not cited. |
| s4 Test Testy, Kearney, opened late | FAIL. Name and Kearney are kept. Late Opening is not cited. |
| s9 Ima Employee, Kearney, opened late | FAIL. Name is shortened to "ima". Late Opening is not cited. |
| s11 Casey Quinn, Bellevue, cell phone | FAIL. The employee is read as "bellevue". |
| s5 Dana Moss, Bellevue | FAIL. The employee is read as "dana". |
| s27 Pat Rivera, standards of conduct | FAIL. The employee is read as "Sam Lee". |
| s28 Pat Rivera, standards of conduct | PASS. Pat Rivera, Store Director. |
| s29 Pat Rivera, corrective action | PASS. Pat Rivera, Store Director. |
| s17 Riley Quinn, performance | PASS. Riley Quinn, Team Member. |
| s20 worksheet, then exit | PASS. No false employee. |
| s21 Alex Morgan, two Sioux Falls stores | FAIL. Name and date are kept. No store is chosen. |
| s25 Jamye Cole, then Yes | PASS. The typed name stays. It does not ask who. |
| s8 Morgan Blake, exit, Lee's Summit | FAIL. No card. |
| s12 Casey Quinn, exit, Kearney | PASS. |
| s16 Quinn Adler, exit, Kearney | PASS. |

## Self-check probe on the same commit

The probe is the real `applySelfCheck` against a roster that has a different
person. The answer is "The corrective action is for" and then the card's name.

| | Flags off | `SELF_CHECK_ENABLED` alone |
| --- | --- | --- |
| Two-word capitalized names (Testy Testerson, Test Testy, Sam Lee, Pat Rivera, Riley Quinn, Alex Morgan, Jamye Cole, Quinn Adler, and the Casey Quinn stand-in when the card had no name) | The sentence stays. 0 blanked. | Replaced with "I couldn't find that person in the Woven roster." The typed name is gone. |
| ima, bellevue, dana, and lowercase "casey quinn" | The sentence stays. | The sentence stays. The mention reader does not treat those as names, so the check does not fire. |

14 of 18 probes blank the name and show the repair sentence when the flag is
on. None do when it is off.

## Round — self-check typed name — 24 Oct 2026

Same harness and the same 18 cases, after the self-check change on this
branch. Empty roster, owner with global scope, today 2026-10-24. The model
is not called. The repair stub is the same one as the baseline: a check
line that says a name is not on the roster still returns "I couldn't find
that person in the Woven roster." No prompt was reverted.

Card checks stay 7/18 with the flags off, and 7/18 with each flag on
alone. Misses and employee names match the baseline row for row. The card
path does not call self-check, so those card failures are unchanged.

The self-check probe is the change. Flags off and `SELF_CHECK_ENABLED`
alone, all 18 answers stay as written. 0 blanked. 0 repair sentences
shown. An unmatched name is no longer a failed check, so the stub is not
asked to rewrite those answers.

| Case | Baseline probe, `SELF_CHECK_ENABLED` | This round |
| --- | --- | --- |
| b9 Casey Quinn stand-in | FAIL. Name blanked. Repair sentence shown. | PASS. Sentence kept. |
| b10 Testy Testerson | FAIL. Name blanked. Repair sentence shown. | PASS. Sentence kept. |
| b11 Casey Quinn stand-in | FAIL. Name blanked. Repair sentence shown. | PASS. Sentence kept. |
| b12 Casey Quinn stand-in | FAIL. Name blanked. Repair sentence shown. | PASS. Sentence kept. |
| s4 Test Testy | FAIL. Name blanked. Repair sentence shown. | PASS. Sentence kept. |
| s9 ima | PASS. Not read as a name. | PASS. Sentence kept. |
| s11 bellevue | PASS. Not read as a name. | PASS. Sentence kept. |
| s5 dana | PASS. Not read as a name. | PASS. Sentence kept. |
| s27 Sam Lee | FAIL. Name blanked. Repair sentence shown. | PASS. Sentence kept. |
| s28 Pat Rivera | FAIL. Name blanked. Repair sentence shown. | PASS. Sentence kept. |
| s29 Pat Rivera | FAIL. Name blanked. Repair sentence shown. | PASS. Sentence kept. |
| s17 Riley Quinn | FAIL. Name blanked. Repair sentence shown. | PASS. Sentence kept. |
| s20 Casey Quinn stand-in | FAIL. Name blanked. Repair sentence shown. | PASS. Sentence kept. |
| s21 Alex Morgan | FAIL. Name blanked. Repair sentence shown. | PASS. Sentence kept. |
| s25 Jamye Cole | FAIL. Name blanked. Repair sentence shown. | PASS. Sentence kept. |
| s8 Casey Quinn stand-in | FAIL. Name blanked. Repair sentence shown. | PASS. Sentence kept. |
| s12 casey quinn | PASS. Not read as a name. | PASS. Sentence kept. |
| s16 Quinn Adler | FAIL. Name blanked. Repair sentence shown. | PASS. Sentence kept. |

A citation check can still ask for one repair. When that repair is
"I couldn't find that person in the Woven roster.",
"I couldn't find Casey Quinn in the Woven roster. The form is ready.",
or "Not verified — no matching employee in Woven", the original answer is
what is shown, and Casey Quinn is still in it. A repair that keeps Casey
Quinn and cites Attendance p.14 from the retrieved section is kept.
