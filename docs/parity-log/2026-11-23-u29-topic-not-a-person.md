# The coaching topic the request opened with reaches the card (QA's Bubbles round 2, U29; board f138)

**Root cause (Ask Bubbles):** "create a coaching form about accountability", then "I want the same form for multiple
employees", then "no put the employee as <P>" made the card with no topic, and the saved form ticked none; the reply even
said the topic "didn't carry over". The name reader takes a word after "about" as a person ("about accountability" →
"accountability"), so the walk back from <P>'s turn (`turnsFromThisPersonsRequest`) stopped at the first turn as another
person's request. The topic's evidence was that turn, so it fell outside this request and `topicKept` refused it
(`evidence_not_this_turn`).

**Fix (`agent-loop/tools.ts`, the request walk):** a "name" whose every word is a word of the topic the model names for
this card, and that shares no word with anyone on the staff list, is that topic and not another person. The model's own
topic and the roster decide; no word list. Only the walk's name reader changes, so a real person's request still bounds
the card (control below).

**Tests:** replay cases `nov23-r2-u29-topic-from-first-turn-reaches-card` (T1–T3 verbatim) fails before and passes
after; the control `nov23-r2-u29-control-another-persons-request-keeps-its-topic` ("create a coaching form for <A> about
accountability" first, a person on the staff list) passes both ways, so <P>'s card never takes <A>'s topic.

**Still open in U29, not this fix:** the card saved with no store although the person has several (the tester's r2full and
r2dm runs). That is the global-login store question, QA's U29 store part, already covered by
`nov22-u29-global-card-person-at-*` on main; the tester's runs show it with a district login and no all-store access.

**Ask Sunny: same gap, port pending.** Sunny main daa2b3c has the same walk (`turnsFromThisPersonsRequest` with
`extractEmployeeNames`) and the same `topicKept` evidence check, so a topic named after "about" in the opening turn is
refused there too. Read-only here; port through QA (salon for store).
