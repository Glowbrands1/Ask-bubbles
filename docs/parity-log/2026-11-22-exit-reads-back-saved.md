# An exit card's reply reads back only what Create saves (QA's Bubbles round 2, U22; Pau's "as you said only for manager facts")

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/exit-read-back.ts`. The exit card's result lists `reads_back`: the lines
Create saves, each "**<the form's label>:** <value>". These are the dates the exit form's own reader read, and the
account under the field it is saved to (Reason for Resignation on a termination, Additional Details otherwise).

`run.ts` checks the reply against that list. A line under one of the exit form's own date or detail labels that is not
in the list goes back to the model once. If it is still there after that, it is left out of the reply, and it is never
offered as a change. A date line that states no date ("not set — you said TBD") claims nothing and stays. There is a
rules-book line too.

Report: T1 "create exit for <P17>. <P17>'s last day worked was TBD. On 11-14-26 General Manager, <P18>, messaged
<P17> via woven … she was quitting effective immediately.", T2 "address: 123 Test St, Lees Summit, MO. 00000". The
reply read back "Date that notice was given: 11/14/2026", which was never stated or saved. It also labelled the
account "Reason for Resignation", though it is saved to Additional Details. Replay cases: `nov22-u22-*`; unit test:
`agent-loop/exit-read-back.test.ts`.

**Ask Sunny: same gap, port pending.** Sunny's exit card has no read-back list, and its reply check does not look at
exit fields. This session has read access only to Ask Sunny, so the port goes to the Sunny coder through QA, titled
`Port from Ask Bubbles (<sha>): …`.
