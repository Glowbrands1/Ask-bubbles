# 2026-11-21 — loop-card write-up: first name, no pronouns, natural second mention (ported)

**Ported from Ask Sunny (cdb2ddc, #1145).** Only for Create from an agent-loop card (`cardFromLoop`); the loop is behind
`AGENT_LOOP_ENABLED`. No new flag. Names in the cases are invented (`replay-pack/loop-roster.ts`).

- The saved write-up (the drafted prose fields, and the exit form's Details lines such as Reason for Resignation) names
  the employee by first name, never she/her/he/him: the forms' own natural rewrite (`nameInsteadOfPronouns`) first, then
  the loop's reply pass (`first-name-write-up.ts`). Quotes, the manual's quoted policy fields, the two derived policy
  fields and a line the manager typed (`keeps`) are left as they are.
- The reply pass (`reply-pronouns.ts`): the person's second mention in one sentence reads naturally. A possessive right
  after a preposition is "the" ("late on the last two shifts"); a repeated subject after and/but/or/then is dropped.
- The loop rules book asks the model for the same. This app has no rules-book fixtures to re-take.
- A coaching card's Observed starts with what was seen, not the card's topic (`coaching-topic-prefix.ts`).

Adapted: the draft route's hooks sit in this app's `loopCardDraft` block (after `loop-write-up-sections`) and load the
new modules with `await import()`, so a draft that is not from a loop card never loads them; the agent-loop import guard
lists the one new importer. Sunny's three changed replay cases (level carry, no-pronoun, and a place-name control) have no
equivalent here; no existing case changed.

**Extended here (QA2's live re-test, 21 Nov 2026), since replaced:** "she wanted to show her team her new puppy" read "<P>
wanted to show <P>'s team <P>'s new puppy". Neither possessive follows a preposition, so this app first extended the rule
to a possessive right after "show" and the clause's next object after a possessive already made "the". **Sibling app:
replaced by Ask Sunny #1198's rule (5758077), ported here** — `reply-pronouns.ts` now has one rule, the sibling's: an
object possessive of a person already named in the sentence is "the", except after a conjunction, at a clause start,
after "with"/"of", and in reported speech. The two Bubbles-only conditions are gone; QA2's three wordings
(`reply-pronouns-second-mention-qa2.test.ts`) and this port's replay cases pass under the sibling's rule unchanged.
