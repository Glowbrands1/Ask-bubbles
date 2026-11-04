## 4 Nov 2026: no false "Updated" after a form edit, Step 4 — port follows (FORM_EDIT_NOOP_GUARD_ENABLED, default off)

Step 4 of the single-writer design (STEPS_2_6_DESIGN, 4 Nov 2026). The one
writer refuses, on the tool, patch, revision and correction paths, an op that
sets a field to the value it already has (`same_value`) and an op whose value
holds the manager's whole latest message of 3 words or more (`copies_message`,
the overnight scan's sf-s11: the request sentence written into the
Observation). Both hand the turn off, all or nothing. On a turn the edit tool
was offered, the reply about the form comes only from the saved diff — one
`Updated: <label>: <value>` line per real change (value at most 80 characters,
cut at a word; a checkbox by its option labels; a clear as `(cleared)`), or
exactly "I didn't change anything on the form. Tell me which part to change
and what it should say." Needs FORM_EDIT_SINGLE_WRITER_ENABLED. See
`src/lib/forms/form-noop-reply.ts` and `form-reducer.ts`.

Sibling app: it has the same writer, reducer and chain, and the same overnight
case (sf-s11 is its own chat). Not ported in this change: the design orders
each Bubbles PR to be followed by its own sibling port, built after the single
writer (Step 2a) and the edit tool (Step 3) are ported there, since this flag
builds on both.
