## 15 Nov 2026: DM L10 assistant drafts the note card straight away for "@name, please do X"

The owner's report (via QA) on the BCS DM L10's Leadership Assistant: a message that @-mentioned a person and asked
them to add something to their to-do list got "I can't add a to-do… Tell me the task and a due date. Then I'll draft
a note…" and no note card.

Cause: the assistant's behaviour comes only from the Hub's system prompt and its draftNote tool description, which
leave it to the model whether to ask first. The draftNote tool was offered; nothing in Ask Bubbles blocked it.

Fix (mechanism only, `src/features/l10/assistant/assistant.server.ts`): when the Hub offers draftNote, a short rule
(`NOTE_NOW_RULE`) follows the Hub's cached prompt as a second system message. An @-mention plus a request drafts the
card in the same reply, worded as a note ("Please add this to your to-do list: …"), with at most one short question
after it. The person still edits and sends the card. Regression test with the owner's wording, names invented.

Sibling app: Ask Sunny has the same code and the same gap (its assistant passes the Hub's prompt through unchanged).
Reported to QA for the STC DM session. The lasting fix may belong in the Hub's prompt for both apps.
