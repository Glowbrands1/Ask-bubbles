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
