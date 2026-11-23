# A loop step cut while thinking is asked again with its tools (QA's live regression set, item 4)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/run.ts` (TRUNCATION_RETRY). Live, "last day worked will be nov 23, notice
was given last Monday, eligible for rehire, notice will be attached, leave address blank I will fill it in" answered "I
couldn't finish that in the steps I have for one message". The loop's step ended "length" at its 2048 output tokens with
no text and no tool call (adaptive thinking spent the whole budget), and the truncation retry, asked without tools,
ended with no text: the turn read as the step limit (or, after a card, the code's "Here is the … for you to review"
line; or the time limit). Such a step is now asked again as the loop step it was, with the tools and twice the output
budget, inside the turn's step budget. A reply cut mid-text keeps the toolless rewrite. No limit was raised.

**Ask Sunny: same code, port pending.** Sunny's main (7787aa9) has the same toolless TRUNCATION_RETRY, the same
`CLAUDE_MAX_TOKENS.standard` (2048) and the same adaptive thinking on the loop's calls. QA assigned the port to Sunny
coder 1. This session has read access only to Ask Sunny.
