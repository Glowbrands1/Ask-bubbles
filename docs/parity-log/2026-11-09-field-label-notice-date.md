# Bubbles-only: the field-label turn keeps an earlier "no notice given" (FIELD_LABEL_NOT_A_QUESTION, the round-6 rollback)

QA, the round-6 rollback (9 Nov 2026): with FIELD_LABEL_NOT_A_QUESTION_ENABLED on, turn 5 of a six-turn exit chat
("resignation date 10-26-2026. how employee resigned - <C> told management she quit …") filled "Date that notice was
given: October 26, 2026" although turn 1 said "no notice given", and quoted the label back as 'You also asked "how
employee resigned - …"'. The exit card was read from this form's turns only, from turn 4's "create exit for <C>" on.
Fixed here inside the flag: an earlier turn's "no notice" holds (`forms/exit-facts.ts`), and a field label is no
question (`forms/message-parts.ts`).

Not needed in the sibling app (checked on its main 24a380e5 with its production flags, where the flag is live): the
same six turns in its salon words already hold, because it reads the exit card from the whole manager window, so turn
1 is never cut away. Its replay pack carries the case as a guard (its branch claude/field-label-notice-date, 50f5583d).
