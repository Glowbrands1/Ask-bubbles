# GOOGLE_REVIEWS_IN_CHAT_ENABLED on in production (Ask Bubbles only)

The owner, 18 Nov 2026: turn on Google reviews in the Ask Bubbles main chat. A Google review question gets the
Google Reviews page's month to date, goal and pace for the asker's stores (with View reports). Flag only; no code
changes. The review sync is healthy (last good sync 18 Nov 2026 11:23 UTC; 2,338 reviews, 7 stores, every store
with a monthly goal).

**Ask Sunny: not needed.** Ask Sunny's chat runs the agent loop (AGENT_LOOP_ENABLED on), whose `read_reviews`
tool already reads the Google Reviews page in production.
