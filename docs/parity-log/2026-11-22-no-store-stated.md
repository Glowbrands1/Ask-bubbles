# "Corporate office, not a store" is answered once (QA's Bubbles round 2, U04)

**Fix (Ask Bubbles):** the loop's propose_form takes `no_store_evidence`, the manager's words saying the form is for
no store. For a login that may file a form with no store (a global, non-admin login), the card is filed with no store.
The reply says so once (`no_store`, "Filed with no store, as you said.") and never asks again. A typed store such as
"corporate office" is then not offered stores (`typed_store_not_found`). A store manager's form still needs its store.
There is a rules-book line and a tool note.

Report: a global district manager, with the person an HR Generalist whom Woven lists at every store with no primary.
T2 "show the policy review form", T3 "<P4>", T4 "corporate office, not a store". The reply was "\"corporate office\"
isn't a store name I know. <P4> works at … in Woven — which one?", and every later turn asked for the store again.
QA: "if the app has no such store, say so once and leave Store blank rather than re-asking every turn." Replay
cases: `nov22-u04-*`.

**Ask Sunny: same gap, port pending.** Sunny's global which-salon step and its typed-salon offer have no "no salon"
answer either. This session has read access only to Ask Sunny, so the port goes to the Sunny coder through QA,
titled `Port from Ask Bubbles (<sha>): …`.
