## 4 Nov 2026: FORM_STATE_ENABLED is ON here and OFF in the sibling app — KNOWN GAP (no change here)

Production differs between the two apps: FORM_STATE_ENABLED is on here and
off in the sibling app. Of this app's chat_form_state rows, 5 of 12 carry the
'incident' text the card path writes with FORM_STATE on. In the sibling app,
none of its rows do, so its cards are built without the saved form state
that cards here read (QA, 3 Nov 2026).

The sibling app will run its replay pack and eval with the flag on, and show
the numbers off vs on, before QA tests it in its production. Nothing changes
here. Until then, behaviour that depends on saved form state can differ
between the apps.
