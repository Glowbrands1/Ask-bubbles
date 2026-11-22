# "Put up the verbal CA for <P>" opens the one on file; "with all the same information" copies it (QA's live round-2 re-run, U16)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/rules-book.ts`, `tools.ts` (find_past_forms). Live, "put up the verbal CA for
<P>" made a new card ("What happened?"), and "create a verbal CA for <P> with all the same information given" asked which
form to copy. Causes: the rules book listed only some verbs for a form on file ("open / edit / pull up / show me"), and
#1028's level-evidence line taught "put up the verbal CA" as a new card's level; and find_past_forms listed the Written
Warning beside the Verbal one, so the copy had no one form to read.
- Rules book: a form the manager refers to as one that exists ("the <form> for <P>", "<P>'s <form>", any verb bringing it
  to the screen) is a form on file; only words asking to make one start a card. "With all the same information" after
  forms on file were shown: read that form and propose with its account, policy and the level named. #1028's example no
  longer says "put up the verbal CA".
- find_past_forms: when the manager's words for the form (the model's form/about and the asking message's quote) hold a
  level some of the person's forms have ticked (their saved warning_type), only those are kept. Form data, no word list.
- Replay harness: `checkOnForm` and `templateIds`, so a case can put forms on file with their level as saved.

**Ask Sunny: check before porting (held until this passes live there too).** Sunny's rules book has the same "Open /
edit / pull up / show me" line and find_past_forms has no level narrowing; whether it carries #1028's "put up" example
depends on that port.
