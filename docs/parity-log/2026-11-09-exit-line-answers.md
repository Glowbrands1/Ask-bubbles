# Bubbles-only: EXIT_LINE_ANSWERS_ADD_UP_ENABLED (an exit form answered one field per turn)

QA, the Bubbles round-7 live test (9 Nov 2026, conv_mw96du1226ye0it): How Employee Resigned, filled on turn 3 ("how
employee resigned - told management"), was blank again on turns 4 and 5: the earlier label turn was read as a question
and left out of the form's turns. With the flag a turn that fills an exit field by its label is never a question.

Not needed in the sibling app (checked on its main 8c772bff, the tester's five turns in its salon words): the fields
already add up, because it reads the exit card from the whole manager window. Its replay pack carries the case as a
guard (its branch claude/missed-shift-cites-attendance).
