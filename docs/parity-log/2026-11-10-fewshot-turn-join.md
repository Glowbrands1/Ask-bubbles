# FEWSHOT ratings joined by turn (Bubbles-only)

FEWSHOT_TURN_JOIN_ENABLED (QA, 10 Nov 2026). This app's few-shot loader joined
`assistant_feedback.client_message_id` to `chat_traces.message_id`; in
production 0 of 14 ratings since traces began match, so FEWSHOT_EXAMPLES would
add nothing. The sibling app's loader already joins a rating to its answer by
turn (`activity_event_id` = `chat_messages.turn_id`), and QA's read of its
production database (10 Nov 2026) found 7 of its 8 top ratings join that way.
Nothing to port: the flag brings this app to the sibling's join.
