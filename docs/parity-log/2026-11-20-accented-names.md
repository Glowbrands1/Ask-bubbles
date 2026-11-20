# 2026-11-20 — accents and curly apostrophes in names (port from Ask Sunny #1141)

**Sibling app: ported from Ask Sunny #1141 (main `45fab9ba`).**

- `src/lib/forms/fold-name.ts` (`foldName`), as in Sunny: accents off without splitting the word, every apostrophe
  straight. It backs the name check (`employee-match.ts` normalize) and `samePerson` (`proposal.ts`), as in Sunny.
- Bubbles-first, at QA's ask ("roster, forms on file, Create"): the forms-on-file lookup (`chat-form-records.ts`:
  `candidateNameWords`, the row's name words, `looksLikeItNamesSomebody`) and the close-spelling reopen reader's name
  words fold the same way. "Ramírez" was read as "ram rez", so a form on file for "Lucia Ramirez" was not named when the
  question typed the accent. The Forms Register READ (`ilike`, a–z only) also gets the old pieces when the question has an
  accent, so a name stored with its accent is still read.
- **Sunny should take the forms-on-file half back**: its `candidateNameWords` still splits accented words.
- **Gap left, both apps:** a question typed WITHOUT the accent ("lucia ramirez") does not read a form whose name is stored
  WITH it ("Lucía Ramírez"): the database `ilike` compares letters as stored. Closing it needs an unaccented name column
  or `unaccent()` in `form_instance_overview` (a migration); not done here.
- Agent-loop parts (evidence reader, find_staff): not ported, no loop here.
