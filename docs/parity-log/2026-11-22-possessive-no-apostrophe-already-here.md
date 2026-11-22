# "open <First>s ca" opens <First>'s forms: already in Ask Bubbles (Ask Sunny #1208, shadow re-run S1)

**Ask Sunny #1208** (`7236e84`, QA's shadow re-run S1, 22 Nov 2026): "open <First>s ca", a possessive typed with no
apostrophe, was refused by find_past_forms as "about someone else", turn after turn (a stuck loop). Sunny's fix,
`withRosterPossessives`, rewrites a roster name followed by a bare "s" as its possessive before the person guard reads
the quoted words.

**Not ported: Ask Bubbles already has it.** `formsOnFileAskedFor` in `src/lib/ai/agent-loop/tools.ts` reads a first or
preferred name that only this person holds, and its possessive with or without the apostrophe ("fenna's", "fennas"),
as naming the person (QA's live re-test, 21 Nov 2026, item 15). The sibling's exact shape passes here without the
port; the replay cases `nov22-s1-open-firsts-ca-not-someone-else` and the control
`nov22-s1-open-other-persons-ca-still-closed` (invented Wenonah Tindall) hold it.

**Gap in both apps, not part of #1208:** a LAST name's bare-s possessive ("show me <last>s forms") is still refused in
both apps. Sunny's rewrite turns it into "<last>'s", but the person guard does not take a last name alone as the
person, so the refusal stays (checked here with the port applied). Reported to QA; no change made.
