# Two people who are both "she" are never mixed up in the write-up (22 Nov 2026, QA, production)

**Sibling app: needs the port, not done in this pull request.** Ask Sunny (`origin/main` 9de3675) has the same
`withoutPersonPronouns` (`agent-loop/reply-pronouns.ts`) without even U23's pronoun-kind check, and its
`first-name-write-up.ts` calls it with no other people and no manager words, so a coworker's "she" becomes the
employee's name on its Create too. This session has read-only access to the sibling repository; QA assigns the port
once this is merged. Port the mechanism (`sameKindOther`, `otherRosterPeopleIn`, the draft route passing them), not
this app's names.

The manager wrote about <A> (she) and a coworker <B> (she) who was giving <A> an attitude; the write-up said "<A> was
giving <A> an attitude", and a coworker who is "he" broke the same way ("He was giving her" → "<A> was giving <A>").
Now each named person's pronoun kind is read from the manager's own words (the subject pronouns whose nearest named
person is them); a she/he pronoun whose nearest named person of its kind is someone else stays as written; an object
pronoun is never the person named in its own clause; and an unsettled one is left as the manager wrote it. Only when
another person of the same kind is named: single-person write-ups are unchanged. Create's pass now gets the roster
people the notes name and the notes themselves.

Replay: `nov22-agent-loop-two-she-write-up-cases.ts` (two "she", one "she" control, a "he" coworker control, and Woven
legal Perpetua / preferred Pip for board item f136). Unit: `reply-pronouns-two-same-kind.test.ts`.
