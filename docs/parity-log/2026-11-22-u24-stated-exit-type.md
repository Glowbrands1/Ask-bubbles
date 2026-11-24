# The exit type the manager states by the box's label is the one saved (QA's live round-2 re-run, U24)

**Fix (Ask Bubbles):** `src/lib/forms/exit-facts.ts` (`statedTypeOption`), `exit-library.ts` (`EXIT_TYPE_OPTIONS`),
`option-label.ts` (#1013's `quoteNamesOption`, moved so the form reader can use it). "… 00000. Immediate Vol Resignation.
Resignation Date 11-11-26. … On 11-11-26 Linnea was a no call no show for her shift …" saved No Call No Show, and the reply
said "Filed as: No Call No Show." The exit form's own reader read the story's event as the type, and when the reader ticks
a type the model's exit_how is dropped (B6's one-decision rule), so #1013's label check never ran. A sentence that is only
a type box's own label (shortened, any case, close spelling) is now the manager stating that box; exactly one such
statement is the type, over any reading of the story. Never the involuntary box.

**Ask Sunny: same gap, port held (QA: after the Bubbles fix passes live).** Sunny's exit reader reads the story's no call
no show the same way and has no stated-label reading.
