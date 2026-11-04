# Port from the sibling app: a failed main call never costs a turn (FORM_EDIT_TOOL_IN_STREAM_ENABLED)

The sibling app's port of step 3 (its PR #504, commit dbeb8702) found a regression that this app has as well. With the tool on, the answering call runs before the old chain, so a model error or configuration error in that call failed the whole turn — including turns the old chain answers without it.

The fix here matches the sibling app:
- The failure is recorded on the trace (`handoff: "error"`) inside `server-ask.ts`, then rethrown.
- The chat route catches it, and the old chain answers.
- The last fallback carries no tool offer.

With the flag off, nothing changes (the flags-off identity test still passes).
