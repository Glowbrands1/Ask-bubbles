# Live-run checks assert what the manager sees; scripted-only checks run with the stand-in (QA's live regression triage)

**Change (Ask Bubbles, replay pack only):** `LoopStandIn.live` (set when the real model plays), `t.loopModel(standIn,
{ scripted: true })` (the stand-in plays in live runs too, for an app condition or a control whose condition is the
stand-in's own input), and the pack's "I still need" invariant also accepts another question in the same reply
(`still-need.ts`; it still fails "I still need the same answer before I can make this card."). The rewritten checks are
Bubbles cases.

**Ask Sunny: mechanism not there; not ported here.** Sunny's pack has neither the `live` marker nor the `scripted`
option, and its "I still need" check reads only who / which store / which date. Sunny's own live set was triaged on its
side (QA). The mechanism (three small harness changes, no app code) is for the Sunny coder to port if QA wants it; this
session has read access only to Ask Sunny.
