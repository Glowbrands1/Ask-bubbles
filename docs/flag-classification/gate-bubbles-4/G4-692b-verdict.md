# Gate-Bubbles-4: #692 DETAILS_FROM_EARLIER_ANSWER_ENABLED re-gate, head 630030f9 (Coding-4): GO
- Base main c88676a (production env from its production-flags.json). Conflict in chat-quality-flags.ts: kept both (verifyfns 0). tsc clean. 1 OFF + 1 ON.
- 14019 tests. Changed 3: INTENDED 2, INTENDED-HARNESS 1, REGRESSION 0.
- The earlier REGRESSION is gone. nov7-refusal-bub-didnt-edit no longer changes between OFF and ON (turn 5 keeps "I haven't changed the **Coaching Form** …"). The new guard nov12-details-from-earlier-answer-none-found holds in both arms (production and fix).
- nov10-chat-edits-a-details-handed-to-the-revision (OPEN) holds.
