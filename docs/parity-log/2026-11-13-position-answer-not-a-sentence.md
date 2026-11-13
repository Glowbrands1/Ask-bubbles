## 13 Nov 2026: POSITION_ANSWER_NOT_A_SENTENCE stays Bubbles-only

QA's live Bubbles 17w test (main b9720947): for someone with no Woven position, "create a CA for <A>, she was late on
11/3/26" asked for the position, and the next turn, "she gets a verbal warning", became the card's Position ("She
Gets A Verbal Warning"). This app's position question and its answer reader (`forms/employee-position.ts`,
`readPositionAnswer`) title-cased any short letters-only reply. Not caused by CARD_CHECKED_AGAINST_WORDS (the same
with it off).

Ask Sunny has no position question and no position-answer reader. Checked on its main (fea1faf1) with the replay
harness, for the same invented person with no position on record: "she gets a verbal warning", "she had a verbal
warning on 10/1", "she owes $25" and "she's a key holder" after the card all leave the card's job title empty. Not
needed there.
