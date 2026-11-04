## 4 Nov 2026: edit_form offered on question turns too — port follows (Pau's ruling A3, FORM_EDIT_TOOL_IN_STREAM_ENABLED)

Pau's ruling A3. The `ABLE_TO_ACT` reading ("is it possible / able to
<action>") and the `asksToActAnyAction` option that fed it are removed from
`src/lib/ai/question-not-form.ts`: no phrase list or regex decides the offer.
With FORM_EDIT_TOOL_IN_STREAM_ENABLED on, `edit_form` is offered on any turn
with a draft form open, question-phrased turns included (the correction,
name-fix and policy-change exclusions stay). The question reading is kept in
the trace (`gate`) for information. A pure question answered in text keeps
that text as its reply; a tool call that writes nothing gets the no-op
guard's line (FORM_EDIT_NOOP_GUARD_ENABLED).

Sibling app: it has the same gate (step 3's port). Not ported in this change:
it follows with the Step 4 port, after Steps 2a and 3 are ported there.
