# A tool call written as text is never the reply (QA's Bubbles live round 3, the regression set on PR 2)

**Root cause (Ask Bubbles):** live, nov22-a1-corrected-spelling-by-id's T3 ("Create the coaching form with the
information given. Her name is <P> and she is at Dodge. …") got the reply `_exec:find_staff {"person_evidence": …}`
(another run: `find_staff` with its input in a code block). The model wrote the call instead of making it: nothing
was looked up, no card was made, and the manager saw tool syntax. No reply check read it. On PR 2's head it failed 9
of 12 live runs (main 3 of 9; main's failures were another mode, the T1 "I still need" invariant).

**Fix (`written-tool-call.ts`, `run.ts`):** read by the loop's own tool names (its registry), never a phrase list: a
line that is one of those names (optionally `_exec:`-prefixed or fenced) followed by a JSON object. The reply goes back
once ("make the call itself"); the hand-back may call tools. If it comes back, the call's lines and fences are left
out, and with nothing left the step-limit reply is shown.

**Ask Sunny: same gap, port pending.** Sunny's main (744c514) has no check for a tool call written as text. Read-only
here; port through QA.
