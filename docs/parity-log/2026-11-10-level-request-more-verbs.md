# This app only: "put together a written CA for <A>" states the Written level (LEVEL_REQUEST_MORE_VERBS_ENABLED)

**The finding.** QA's audit (10 Nov 2026): the overnight scan's sf-s17 twin, "put together a written CA for <A> for not compelting her woven courses by the deadline of october 31st", left the card's level unset here. The same case holds in the sibling app.

**The cause.** This app's level reader (`forms/warning-level.ts`) reads a level in the request's own clause as this form's (REQUEST_LEVEL_NOT_HISTORY) only after a known request verb ("create", "make", "draft", "need" …). "put together" was not one, and the deadline's date made "written" unclear.

**The fix.** With the flag on, "put together", "prepare", "draw up" and "do up" open a request as "create" does, in `levelInRequestClause` only.

**Not needed in the sibling app.** Its level reader is built differently (no request-clause list) and already reads "put together a written CA" as Written (checked with its production flags, 10 Nov 2026).
