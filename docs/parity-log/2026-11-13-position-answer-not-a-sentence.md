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

QA's two follow-up items, same flag:

- "she's a key holder" answering the position question: this app takes it as the title (Key Holder, as "she's a shift
  lead" always was) and now says so in the reply ("Job title set to **Key Holder**, as you said."). Ask Sunny asks no
  position question; there "she's a key holder" after a card leaves the job title as it was, with nothing claimed. Not
  needed there.
- "create corrective action form for <A>, Team Member Part Time": moved to Coding-4's REQUEST_LINE_TITLE_KEPT (#884),
  which owns `forms/title-of-another-person.ts` (QA's ruling, 14 Nov 2026). Not in this flag.
- v2-Gate-Bubbles-3's probes (14 Nov 2026): "it's her second time", "she's a team lead i think", "she's in training"
  and "she's new" were read as the title, and with the flag announced. Now: "it's / it is …" is a sentence; a hedge,
  ordinal, "again" or "second time" is never a title word; after "she's / she is" the rest must name a role. Ask
  Sunny asks no position question, so the same holds: not needed there.
- Left for ANSWER_IS_THE_ISSUE (Coding-2, #866): on that second turn the card's Issue still reads "Team Member Part
  Time; she skipped …" with this flag alone.
