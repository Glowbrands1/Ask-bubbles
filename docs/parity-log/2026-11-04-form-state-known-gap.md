## 4 Nov 2026: FORM_STATE_ENABLED is OFF in both apps — not a gap (corrected)

Correction to an earlier note that said this app runs FORM_STATE_ENABLED on.
QA, 3 Nov 2026: this app's 12 chat_form_state rows all come from one
11-minute window on 24 Oct 2026, with none since. They are no evidence that
the flag is on. `src/config/production-flags.json` already lists it under
"off", and the sibling app lists it "off" too.

So the two apps behave the same here. Before either app turns it on: run the
replay pack and the eval with FORM_STATE_ENABLED on, show the numbers off vs
on, have QA test it in production with rollback ready, and update
production-flags.json in a one-line PR.
