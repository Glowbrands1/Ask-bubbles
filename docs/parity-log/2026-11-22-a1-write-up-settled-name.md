# The saved write-up uses the settled name, even when the misspelling shares no word with it (QA's live re-run, A1 notes)

**Fix (Ask Bubbles):** `src/lib/forms/short-name.ts` (`withCorrectedSpelling`). T1 "My employee <P1> has was 10 minutes
late …", then T3 "Her name is <P2> …": the card was <P2>'s, but the saved write-up, drafted from the manager's T1, kept
<P1>. Create's spelling step only looked at two-word names that share a word with the person's name; <P1> ("Tadea Krohl"
for "Thaddea Kroll") shares none, so the roster was never asked. A pair written as a name (both words capitalized) is now
read by the roster too; the roster still decides (this person alone, by close spelling).

**Ask Sunny: same gap, port pending.** Sunny's `short-name.ts` has the same shared-word guard (and its Create applies the
same pass to the manager's lines), so a misspelling sharing no word with the name stays in the saved write-up there too.
This session has read access only to Ask Sunny; the port goes to the Sunny coder through QA.
