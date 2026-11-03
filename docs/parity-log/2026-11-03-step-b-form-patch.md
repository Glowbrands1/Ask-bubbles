## 3 Nov 2026: Step B, one form-update path — both apps (FORM_PATCH_REDUCER_ENABLED, FORM_REPLY_FROM_DIFF_ENABLED): flipped on 19:38–19:42 UTC, ROLLED BACK 19:52 UTC

Built here first, then ported to the sibling app with the same flags:
- #403 open cases;
- #404 inert modules;
- #406 wiring;
- #407 final claim rule;
- #409 a patch that sets nothing hands the turn back.

A chat edit or a redraft of an open form is read as a patch and merged by
`forms/form-reducer.ts`. A path's reply is replaced only when none of the
fields it claims changed.

QA turned both flags on in both apps at 19:38–19:42 UTC on 3 Nov and rolled
them back at 19:52 UTC after the testers' live "after" run.

Findings in both apps:
- "redraft it and say she was also late on Tuesday" and the coaching "fix
  her last name, it is …" answered "I didn't change anything". A patch whose
  sets were all refused did not fall back to the old path.
- "make it sound more professional" / "can you make it more professional"
  did not rewrite the Details.

Findings here only:
- "fix her last name, it is Quill-Hart" dropped the first name from the
  Observation.

Findings in the sibling app only:
- Replies echoed raw field text, and the no-change reply lost "Tell me which
  part to change".
- About +2 s per reply here, and about +5.8 s on the sibling app's name fix.

Fixes are being designed before any re-flip; see REPORT.md, "Step B ROLLED
BACK". Until then both flags are off in both apps.

Differences in the sibling app's port:
1. Payroll: its ACTION_PLAN_MANAGER_ONLY keeps the action plan manager-only.
2. Daily Stats: there, the turn reaches a later card-intake path.
3. Copy case: there, the copy case asks for the copy before naming the colleague.
