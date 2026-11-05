# 5 Nov 2026: the sibling's card-Observation fixes — not needed here

Ask Sunny (Pau via QA, sf-s22/s23/s25) reads three things out of its card's
Observation of Offense: another employee's pasted notes
(OBSERVATION_OTHER_PERSON_TURN_ENABLED), a question asked before the request
(OBSERVATION_NOT_EARLIER_QUESTION_ENABLED) and a payroll-only answer
(PAYROLL_ANSWER_SPELLING_ENABLED's Observation half).

**Not needed in Ask Bubbles:** its card has no Observation of Offense line
(Sunny's `src/lib/ai/keep-filled-slots.ts` has no counterpart here); the
twins `nov5-twin-sf-s22-ca-not-coaching`, `nov5-twin-sf-s23-…` and
`nov5-twin-sf-s25-…` assert the Observation and hold on it. The other halves
are ported: PASTED_BLOCK_FORM_ENABLED (sf-s22, the form named in pasted
notes) and PAYROLL_ANSWER_SPELLING_ENABLED's reader.
