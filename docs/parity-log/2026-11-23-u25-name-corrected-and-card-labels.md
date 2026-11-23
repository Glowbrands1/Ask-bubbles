# A corrected name says what else changed; the card's line labels stay out of the write-up (QA's Bubbles round 2, U25)

**Reported:** U25 (store manager at Kearney; T1–T5 verbatim in the replay case). The ruling stands: undersales and
under-performance coaching cites Standards of Conduct. QA asked for the three small defects; two are fixed here.

**(2) "nothing else changed" while the topic was dropped.**
- **Problem:** T5 ("create coaching form for <P>; coaching on under performance") corrected the card's name and dropped T4's coaching topic. The reply still said "…; nothing else changed."
- **Cause:** the `name_corrected` fact carried only from and to, and the rules book always told the model to say "nothing else changed".
- **Fix:**
  - The card record (`card-record.ts`, the trace's `slots.agent_loop.card`) now also keeps the card's coaching topic: a form label, never a name.
  - `name_corrected` carries `also_changed`: what differs from the card the name was corrected on, field by field. That covers the topic, account, policy, level, payroll and store.
  - The rules book says "nothing else changed" only when `also_changed` is empty; otherwise the reply names each change.
  - An older record without a topic is not compared on topic.

**(3) "What happened:" in the saved Details.**
- **Problem:** Create saved "Observed:\nWhat happened: <A> had under performance."
- **Cause:** the drafting model echoed the card's own note line (`draftNotesFromCard`).
- **Fix:** `loopCoachingWriteUp` removes any of those card line labels (`CARD_LINE`, now exported from `draft-notes.ts`) from the start of a section line and keeps the text. These are the app's own labels, not a word list.

**(1) The empty reply to T3 "yes": not fixed here.** Main already replaces an empty model reply with the step-limit
reply. The tester's trace for T3 has been asked for.

**Tests:**
- Replay cases `nov23-r2-u25-name-corrected-says-what-else-changed` and `nov23-r2-u25-saved-details-no-what-happened-label`: both fail before the fix and pass after.
- `loop-coaching-write-up.test.ts` (new), with a control showing that "what happened:" inside a sentence stays.

**Ask Sunny: same gaps, port pending.** Sunny main 0caa7fc has the same `name_corrected` rule ("nothing else changed",
always), no topic on its card record, and the same `loopCoachingWriteUp` without the label strip. Read-only here; the
port goes through QA (salon for store).
