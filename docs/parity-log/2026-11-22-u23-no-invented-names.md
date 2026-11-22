# The reply names only names the directory holds (QA's live round-2 re-run, U23)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts`, `rules-book.ts`, `run.ts`. The reply said "**<preferred>
<last>** (Marguerite — legal name in Woven: …)" and "Margo note: …": the rules book taught legal_name_in_woven with an
example of invented names ("**Margo Vale** (Marguerite Vale in Woven)") and the model copied them. propose_form now writes
the line from the directory (`legal_name_in_woven: { name, say_exactly }`), the rules book says to say it word for word,
and no rules-book or tool-description example names a person (also "Imogen Strathe" and "Odalys" became placeholders).
`prompt-no-example-names.test.ts` keeps them out.

**Ask Sunny: same gap, port held (QA: after the Bubbles fix passes live).** Sunny's rules book teaches
legal_name_in_woven with "**Jo Quill** (Josephine Quill in …)" and its propose_form gives the legal name as a bare string,
so the same copying can happen there. Sunny's prompt fixtures (`sunny-rules-book.txt`, `sunny-system-rules.txt`) need
re-taking for the changed lines.

**Also in this PR (U23, T5/T6 and the saved Observation):**
- `reply-pronouns.ts`: the person's own pronoun is the one the manager uses ("she" forms only, or "he" forms only); a
  pronoun of another kind is someone else wherever it stands. The card pass had kept "they" in "<P> asked another
  employee what they would do …" (#1014), but the reply pass, whose reporter was now the name, replaced it, and the next
  turn's account copied the reply. Ask Sunny: #1014's port is itself pending there; port both together.
- Create (`draft/route.ts`): a card made by the preferred name finds its person by that name too; the directory's legal
  name, and alone the legal first name when no other staff member has it, become the card's name in the drafted prose.
  Ask Sunny: same spelling step (`rosterSpellingOf` by the legal display name only); port held with the rest.
