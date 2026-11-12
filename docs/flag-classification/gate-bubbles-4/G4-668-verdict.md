# Gate-Bubbles-4: #668 TEAM_CARD_NOT_PRODUCT_ENABLED, head e77d80ae (Coding-4): GO
- Base main 815ae303 (17o, 357 production flags; moved there per QA). Conflicts: chat-quality-flags.ts (kept both), and forms/instances/route.ts, where main's sameRequestReadConversation(…, body.employeeName) and #668's teamTopicReadConversation wrapper were composed: teamTopicReadConversation(sameRequestReadConversation(switchReadConversation(turnsWithoutPastedReview(parseHistory(…))), employeeName), employeeName). tsc clean. 1 OFF + 1 ON.
- 14552 tests. Changed 4: INTENDED 4, REGRESSION 0.
- nov4-scan-sf-s13-team-coaching-blank-employee (OPEN) holds, and nov6-offer-never-a-product (both arms) gets the same one-line change. On the team Coaching card, after "The employee needs to be left blank for now":
  - OFF: "I have **Bath Bomb Kits** and the store (**Omaha, NE (West Dodge Rd)**) …" (the product read as the employee)
  - ON: "This one is for the whole team, and I have the store (**Omaha, NE (West Dodge Rd)**) …"
