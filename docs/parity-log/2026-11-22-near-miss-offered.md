# A close spelling of a staff member is offered, never kept as typed (QA's Bubbles round 2, U25/U34/U35) — Bubbles only

**Fix (Ask Bubbles):** `loopNameMatch` / `closeToRoster` in `src/lib/ai/agent-loop/tools.ts`. With TYPED_NAME_ENABLED
(on in this app's production), the shared matcher answers ONE close staff name as "unchecked" with its closeName (the
regular chat path's "Woven has <name>" note under a card kept as typed). The loop read only "confirm" as close, so a
one-slip misspelling ("<First> Garica" for "<First> Garcia") was kept as typed. The loop now reads that closeName as a
"Did you mean <name>?" question (Pau's rule: a staff match only on the manager's exact words or her yes to "Did you
mean", which also offers keeping it as typed). A name the manager already chose to keep stays as typed. The regular
chat path is unchanged.

Report (masked): U34 "create a ca form for <P13-first> Garica"; U35 T2 "<P13-first> Rameirz"; U25 T2 "<P9-first> Sheirs"
— each "isn't on your store's Woven staff list, so I've used the name as you typed it", card and saved draft with the typo.

**Ask Sunny: not needed.** TYPED_NAME_ENABLED is off in Sunny's production and its matcher answers a close name as
"confirm", which its loop already offers. Sunny's own partial-name work (f110) is separate.
