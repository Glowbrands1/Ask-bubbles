## 4 Nov 2026: the edit tool in the main call, Step 3 — port follows (FORM_EDIT_TOOL_IN_STREAM_ENABLED, default off)

Step 3 of the single-writer design (STEPS_2_6_DESIGN, 4 Nov 2026). With a
draft open and a turn that is not a question, a correction or a policy change,
the answering call is offered one tool, `edit_form` (the owner's approved
description, verbatim), with the open form as JSON and the scoped staff in one
extra data block before the question. A tool call is written through
`writeFormEdits` (path "tool", all or nothing) and answered from the saved
diff; otherwise the turn goes to the old chain. One model call; nothing is sent
back. Needs FORM_EDIT_SINGLE_WRITER_ENABLED. See
`src/lib/forms/form-edit-tool.ts`.

Sibling app: it has the same main call (its `server-ask.ts` → `call-claude.ts`)
and the same chain, and its stream reader must also collect `tool_use` and
`input_json_delta`. Not ported in this change: the design orders each Bubbles
PR to be followed by its own sibling port, built after the single writer
(Step 2a) is ported there, since this flag requires it.
