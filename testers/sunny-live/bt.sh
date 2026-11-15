#!/bin/bash
# usage: bt.sh <set> <turn> "<text>" [conv]   (BUTTON=1 env to press the chat's own create-form button)
node base.js "$@" 2>&1 | grep -E "^(HOW|CHAT_BUTTON|SAVED|MASK LEAK|SET|FORMS|CARD|ERR)|Policy|Observation|On file|date \(|for \*\*|Is this|Which|Job title|Coaching|form|Nothing" | grep -vE "^(One more question|You'll set|Create the draft here)" | cut -c1-450
