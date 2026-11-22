# "Did you mean <P>?" is not asked again once the manager corrected the typo or the card is <P>'s (QA's live round-2 re-run, U35(a))

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/confirmed-spelling.ts`, `tools.ts`. "Liesl Moreno Vagras" got "Did you mean
**Liesl Moreno Vargas**?"; T4 "fix her last name vargas" was not read as an answer (not a yes, not the full name), so the
same question came back at T3–T6 (live on main), and in the tester's run it came back after the card was already hers.
- confirmed-spelling.ts: an answer holding the one word that turns the manager's typed name into the offered name ("the
  typed name with that word in place of the one that differs") confirms the one person offered (`by: "correction"`). The
  typed name is found in the manager's own earlier words by the record's key.
- tools.ts: `closeSpellingNotSettled` settles a person the chat's card (on screen, or the latest) already is; and a close
  spelling whose only match is the card's own person keeps the card theirs (`cardNameCorrection`), with no name_corrected.

- tools.ts find_staff (QA's follow-up): after the question, "fix her last name garcia" (a word that does not turn the typed
  name into the offered one) seated the offered person, because "the person on this chat's card" was read from the
  replies' TEXT, and the Did-you-mean question itself names them. The card is now read from the chat's card record; a
  close spelling is seated without asking only when this chat's recorded answer confirmed it.

**Ask Sunny: same gap, port held.** Sunny's `confirmed-spelling.ts` reads only a yes or the offered full name.
