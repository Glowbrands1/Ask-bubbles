# 2026-11-21 — the Action Plan adds the steps the manager stated: ported, default off

**Ported from Ask Sunny (18a3aca, #1178; its f062).** Behind STATED_PLAN_STEPS_ENABLED (same name in both apps,
default off, listed "off" in `src/config/production-flags.json`; QA flips it after a live test). The standard Action
Plan stays exactly as it is; each step the manager stated ("the opening procedures reviewed with <P> this week") is
added in their words, lightly tidied, as its own sentence before the closing ("Future policy violations …" or the
termination sentence). A step is never invented; with no step the plan is byte-identical.

The mechanism, ported both halves (this app has the agent loop since #991):

- `lib/forms/stated-plan-steps.ts` (pure: `keptPlanSteps`, `withPlanSteps`, `withCardPlanSteps`) and its test;
- the agent loop: propose_form's `plan_steps` with `plan_evidence` (only with the flag on, so the tool schema is
  unchanged off), kept on evidence from this request and the quote's words (`agent-loop/run.ts`, `agent-loop/tools.ts`);
- the regular chat: the intent reader's optional `planSteps` slot (`intentToolInputSchema`, `readPlanStepsSlot` in
  `intent-slots.ts`, since this app's reader has no zod schema), held for the turn by `ai/plan-steps-turn.ts` and put on
  a Corrective Action card in `server-ask.ts` (`answerQuestionTraced`, this app's turn wrapper);
- the chat route shows the steps on the card's Action plan line; Create sends `cardPlanSteps` from either path, and
  the draft route adds them to its plan (`planValue`), re-checking the regular chat's against the notes.

Differences from the sibling app: the regular-chat half reads steps from the intent reader, and INTENT_EXTRACTION_ENABLED is off
in this app's production, so with only STATED_PLAN_STEPS_ENABLED on, the regular chat's plan is unchanged; the replay
cases turn both on for that path. Replay: `nov21-action-plan-stated-steps-cases.ts`, an invented store account and the
loop roster's invented person; the reporter's closing sentence is kept word for word.
