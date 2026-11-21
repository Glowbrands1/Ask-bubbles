# The exit type is the one the manager named (QA's Bubbles round 2, U24)

**Fix (Ask Bubbles):** `quoteNamesOption` / `exitOptionLabel` in `src/lib/ai/agent-loop/tools.ts`. The model's exit_how
is kept only when its quoted words name that option's own label on the template version (at least half the label's
words of three letters or more, each said exactly, as a prefix of three or more letters, or as a close spelling). The
labels come from the form; no list of phrasings.

Report (QA's quote, person masked): "Immediate Vol Resignation … resigned via phone call" was filed as "No Call No Show"
and saved resignation_type=no_call_no_show (the model's exit_how, quoting "resigned via phone call").

**Ask Sunny: same gap, port pending.** Sunny's exit_how (the mechanism this app ported) checks only that the quote is
the manager's; nothing ties it to the option's label. Read-only here; port to the Sunny coder through QA.
