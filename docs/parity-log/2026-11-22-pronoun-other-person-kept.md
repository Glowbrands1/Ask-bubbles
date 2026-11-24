# Another person's "they" is never the card's person (QA's Bubbles round 2, U23)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/reply-pronouns.ts` (`pronounKind`). In a clause a pronoun reports ("she
asked … what they would do"), a pronoun of another kind than the reporter's (she / he / they) is someone else and stays
as written; the reporter's own kind is still named. Grammar only, no phrase list.

Report (masked): T5 "… Today, while checking out a customer, she asked another employee what they would do if they had 8
arms and 8 legs. …" became "<P> asked another employee what <P> would do if <P> had 8 arms and 8 legs".

Not in this fix, asked of QA: "her boyfriend" → "the boyfriend" (the 20 Nov second-mention rule).

**Ask Sunny: same bug, port pending.** This module is Sunny's (ported); its reported-clause reading has no pronoun-kind
check. Read-only here; port to the Sunny coder through QA.
