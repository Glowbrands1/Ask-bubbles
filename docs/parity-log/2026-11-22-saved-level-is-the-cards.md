# The saved form has the card's warning level (QA's Bubbles round 2, U09)

**Fix (Ask Bubbles):** Create (`src/app/api/forms/instances/route.ts`) saves a loop card's warning level when it is the
level the loop's own server record for that card holds (`loopCardSettlement(...).level`, from `slots.agent_loop.card`).
The loop locked that level on the manager's evidence at card time. Before, Create re-read the conversation with the
older reader, which took "Verbal CA 11-1-2026" (a prior step) as the level, so the card's Written was not saved. Every
other card is read as before.

Report (masked): T1 "create a written CA for <P6>." T2 "JBA Policy Manual 1-1-2026, Verbal CA 11-1-2026. On 11-1-26 <P6>
violated care and cleaning of facilities policy" — card Written, saved draft no warning_type.

**Ask Sunny: check pending.** Sunny's Create has the same re-read for loop cards (ported path); whether its card record
carries the level the same way is to be confirmed by the Sunny coder. Read-only here.
